import {
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { BookMetadataService } from '../book-metadata/book-metadata.service';

import { EPub } from 'epub';
import { createReadStream, existsSync, statSync } from 'fs';
import { copyFile, readdir, readFile, rename, stat, unlink } from 'fs/promises';
import * as iconv from 'iconv-lite';
import { join } from 'path';
import { BookFormat } from '../../common/types/prisma-compat';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    BookQueryDto,
    BookResponseDto,
    BookStatsDto,
    CreateBookDto,
    PaginatedBooksDto,
    UpdateBookDto,
} from './dto/books.dto';

export interface BookParagraph {
  id: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

// MOBI parser is ESM-only, use dynamic import
let mobiParser: typeof import('@lingo-reader/mobi-parser') | null = null;
async function getMobiParser() {
  if (!mobiParser) {
    mobiParser = await import('@lingo-reader/mobi-parser');
  }
  return mobiParser;
}

@Injectable()
export class BooksService implements OnModuleInit {
  private readonly logger = new Logger(BooksService.name);
  private readonly nasEbookPaths: string[];
  private readonly primaryEbookPath: string;
  private readonly apiBaseUrl: string;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly metadataService?: BookMetadataService, // T7: optional metadata service
  ) {
    // NAS_EBOOK_PATH may be a single path or a colon/comma-separated
    // list. We always treat it as an array; the first entry is the
    // "primary" root used for new uploads.
    const configured =
      this.configService.get<string[]>('app.nasEbookPaths') ||
      this.configService.get<string>('app.nasEbookPath') || // legacy single-string form
      '/data/ebooks';
    this.nasEbookPaths = Array.isArray(configured)
      ? (configured.length > 0 ? configured : ['/data/ebooks'])
      : [configured];
    this.primaryEbookPath = this.nasEbookPaths[0];
    this.apiBaseUrl = this.configService.get<string>('app.apiBaseUrl') || 'http://localhost:3000';

    // Log the parsed roots so misconfigurations (typo, missing
    // volume mount) are immediately visible in `docker logs`.
    this.logger.log(
      `NAS_EBOOK_PATH resolved to ${this.nasEbookPaths.length} root(s): ${JSON.stringify(this.nasEbookPaths)}`,
    );
    for (const root of this.nasEbookPaths) {
      if (existsSync(root)) {
        this.logger.log(`  [ok]    ${root}`);
      } else {
        this.logger.warn(
          `  [MISS]  ${root} — directory not found, scan will skip it. ` +
            `If this is unexpected, check the volume mount in docker-compose.yml: ` +
            `for multi-root setups you need a separate host→container bind per root.`,
        );
      }
    }
  }

  /**
   * Resolve a relative `filePath` (as stored on the Book row) to an
   * absolute path on disk. Order of resolution:
   *   1. filePath → root cache populated by the most recent scan.
   *   2. First configured root where `filePath` exists.
   *   3. `join(primaryEbookPath, filePath)` — used so callers can
   *      surface a clear "file not found" error from a stable path.
   */
  private resolveEbookPath(filePath: string): string {
    const cached = this.filePathRootCache.get(filePath);
    if (cached) {
      const candidate = join(cached, filePath);
      if (existsSync(candidate)) return candidate;
    }
    for (const root of this.nasEbookPaths) {
      const candidate = join(root, filePath);
      if (existsSync(candidate)) {
        this.filePathRootCache.set(filePath, root);
        return candidate;
      }
    }
    return join(this.primaryEbookPath, filePath);
  }

  onModuleInit() {
    this.scanLocalBooks().catch(() => {
      // ignore scan errors on startup
    });
  }

  async create(dto: CreateBookDto): Promise<BookResponseDto> {
    // Calculate file hash and size if file exists
    let fileHash: string | undefined;
    let fileSize: bigint | undefined;

    const fullPath = this.resolveEbookPath(dto.filePath);
    if (existsSync(fullPath)) {
      try {
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256');
        await new Promise<void>((resolve, reject) => {
          createReadStream(fullPath)
            .on('data', (chunk) => hash.update(chunk))
            .on('end', () => {
              fileHash = hash.digest('hex');
              const stats = statSync(fullPath);
              fileSize = BigInt(stats.size);
              resolve();
            })
            .on('error', reject);
        });
      } catch {
        // ignore hash errors
      }
    }

    const book = await this.prisma.book.create({
      data: {
        title: dto.title,
        author: dto.author,
        description: dto.description,
        isbn: dto.isbn,
        publisher: dto.publisher,
        publishedDate: dto.publishedDate ? new Date(dto.publishedDate) : undefined,
        language: dto.language || 'en',
        format: dto.format,
        filePath: dto.filePath,
        fileHash,
        fileSize,
      },
      include: {
        bookTags: { include: { tag: true } },
      },
    });

    return this.toBookResponse(book);
  }

  async createFromUpload(file: Express.Multer.File): Promise<BookResponseDto> {
    // Fix multer encoding issue: originalname may be incorrectly encoded as Latin1
    const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    console.log(`[BooksService] createFromUpload: raw originalname="${file.originalname}", fixed originalname="${originalname}"`);

    const ext = originalname.split('.').pop()?.toLowerCase() || '';
    const ebookExts = ['txt', 'epub', 'pdf', 'mobi', 'azw3', 'fb2', 'djvu'];
    if (!ebookExts.includes(ext)) {
      throw new Error(`不支持的文件格式: ${ext}`);
    }

    const destPath = join(this.primaryEbookPath, originalname);

    // If file already exists, append a number
    let finalFileName = originalname;
    let finalDestPath = destPath;
    let counter = 1;
    while (existsSync(finalDestPath)) {
      const nameWithoutExt = originalname.replace(/\.[^/.]+$/, '');
      finalFileName = `${nameWithoutExt} (${counter}).${ext}`;
      finalDestPath = join(this.primaryEbookPath, finalFileName);
      counter++;
    }

    try {
      await rename(file.path, finalDestPath);
    } catch (err: any) {
      // EXDEV: cross-device link not permitted — fall back to copy + unlink
      if (err.code === 'EXDEV') {
        await copyFile(file.path, finalDestPath);
        await unlink(file.path);
      } else {
        throw err;
      }
    }

    const fileStat = statSync(finalDestPath);
    const title = finalFileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    console.log(`[BooksService] createFromUpload: finalFileName="${finalFileName}", title="${title}"`);

    const existing = await this.prisma.book.findFirst({
      where: { filePath: finalFileName, isDeleted: false },
    });
    if (existing) {
      return this.toBookResponse(existing);
    }

    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    let fileHash: string | undefined;
    await new Promise<void>((resolve, reject) => {
      createReadStream(finalDestPath)
        .on('data', (chunk) => hash.update(chunk))
        .on('end', () => {
          fileHash = hash.digest('hex');
          resolve();
        })
        .on('error', reject);
    });

    const book = await this.prisma.book.create({
      data: {
        title,
        author: 'Unknown',
        format: ext,
        filePath: finalFileName,
        fileSize: BigInt(fileStat.size),
        fileHash,
        language: 'zh',
        metadata: '{}',
      },
      include: {
        bookTags: { include: { tag: true } },
      },
    });

    // T7: auto metadata fetch
    if (this.metadataService) {
      this.metadataService.fetchAndUpdateBook(book.id).catch(() => {
        // ignore metadata fetch errors
      });
    }

    return this.toBookResponse(book);
  }

  /**
   * Map of `filePath` (as stored on Book) → root directory that first
   * surfaced that path during the most recent scan. Used by
   * `resolveEbookPath` to look up the correct absolute path on disk
   * even after server restarts. Entries are written by
   * `collectEbookFilesRecursively` and read by `resolveEbookPath`.
   *
   * On a server restart the map starts empty; missing entries fall
   * through to "first existing root" / primary root, which is
   * correct for the common single-root deployment and still works
   * when the user has multiple roots with non-overlapping file names.
   */
  private readonly filePathRootCache = new Map<string, string>();

  async scanLocalBooks(): Promise<number> {
    const ebookExts = ['txt', 'epub', 'pdf', 'mobi', 'azw3', 'fb2', 'djvu'];
    let added = 0;

    try {
      const entries = await this.collectEbookFilesRecursively(ebookExts);
      for (const { filePath, rootPath } of entries) {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const existing = await this.prisma.book.findFirst({
          where: { filePath, isDeleted: false },
        });
        if (existing) {
          // Refresh root cache from re-scan results (e.g. user moved
          // the file to a different root and restarted the server).
          this.filePathRootCache.set(filePath, rootPath);
          continue;
        }

        const fullPath = join(rootPath, filePath);
        const fileStat = await stat(fullPath);
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        const title = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

        const createdBook = await this.prisma.book.create({
          data: {
            title,
            author: 'Unknown',
            format: ext,
            filePath,
            fileSize: BigInt(fileStat.size),
            language: 'zh',
            metadata: '{}',
          },
        });
        this.filePathRootCache.set(filePath, rootPath);

        // T7: auto metadata fetch
        if (this.metadataService) {
          this.metadataService.fetchAndUpdateBook(createdBook.id).catch(() => {
            // ignore
          });
        }
        added++;
      }
    } catch {
      // ignore scan errors
    }
    return added;
  }

  /**
   * Walk every configured NAS root in priority order and return the
   * list of ebook files (with the root that surfaced each one). On
   * collisions — same relative path in two roots — the earlier root
   * wins and the later one is skipped, so the on-disk canonical
   * location is deterministic and matches the user's primary root.
   */
  private async collectEbookFilesRecursively(
    ebookExts: string[],
    rootOverride?: string,
    relativePath = '',
  ): Promise<{ filePath: string; rootPath: string }[]> {
    const roots = rootOverride ? [rootOverride] : this.nasEbookPaths;
    const seen = new Set<string>();
    const out: { filePath: string; rootPath: string }[] = [];

    for (const root of roots) {
      let entries: import('fs').Dirent[];
      try {
        const currentPath = relativePath ? join(root, relativePath) : root;
        entries = await readdir(currentPath, { withFileTypes: true });
      } catch {
        // Root doesn't exist or isn't readable; skip it. Single-root
        // setups keep working because the default '/data/ebooks' is
        // the only entry and is allowed to be missing in dev.
        continue;
      }

      for (const entry of entries) {
        const nextRelativePath = relativePath
          ? join(relativePath, entry.name)
          : entry.name;
        if (entry.isDirectory()) {
          const nested = await this.collectEbookFilesRecursively(
            ebookExts,
            root,
            nextRelativePath,
          );
          for (const f of nested) {
            if (seen.has(f.filePath)) continue;
            seen.add(f.filePath);
            out.push(f);
          }
          continue;
        }

        if (!entry.isFile()) continue;
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        if (!ebookExts.includes(ext)) continue;
        if (seen.has(nextRelativePath)) continue;
        seen.add(nextRelativePath);
        out.push({ filePath: nextRelativePath, rootPath: root });
      }
    }

    return out;
  }


  // ─── Chapter Parsing ─────────────────────────────────────────────────────

  private async readTextFile(fullPath: string): Promise<string> {
    const buffer = await readFile(fullPath);
    // UTF-8 BOM
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.toString('utf-8');
    }
    // Try UTF-8 first, fallback to GBK if replacement characters appear
    const utf8 = buffer.toString('utf-8');
    if (!utf8.includes('\uFFFD')) {
      return utf8;
    }
    return iconv.decode(buffer, 'gbk');
  }

  private async parseTxtChapters(filePath: string): Promise<{ title: string; startLine: number }[]> {
    const fullPath = this.resolveEbookPath(filePath);
    if (!existsSync(fullPath)) return [];

    const text = await this.readTextFile(fullPath);
    const lines = text.split(/\r?\n/);

    // Patterns for chapter detection (Chinese novels)
    const chapterPatterns = [
      /^\s*前言\s*$/i,
      /^\s*引子\s*$/i,
      /^\s*楔子\s*$/i,
      /^\s*序[章言]?\s*$/i,
      /^\s*第[一二三四五六七八九十百千万零\d]+[章回节卷部集]\s*.*/,
      /^\s*第\d+[章回节卷部集]\s*.*/,
      /^\s*[\d零一二三四五六七八九十百千万]+\s*[、.．]\s*.*/,
      /^\s*附录[一二三四五六七八九十]?\s*$/i,
      /^\s*后记\s*$/i,
      /^\s*尾声\s*$/i,
    ];

    const chapters: { title: string; startLine: number }[] = [];
    lines.forEach((line, index) => {
      for (const pattern of chapterPatterns) {
        if (pattern.test(line)) {
          chapters.push({ title: line.trim(), startLine: index });
          break;
        }
      }
    });

    // If no chapters found, treat whole file as one chapter
    if (chapters.length === 0) {
      chapters.push({ title: '正文', startLine: 0 });
    }

    return chapters;
  }

  async getChapters(id: string): Promise<{ title: string; index: number }[]> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
    });
    if (!book) throw new NotFoundException('Book not found');

    if (book.format === 'txt') {
      const chapters = await this.parseTxtChapters(book.filePath);
      return chapters.map((c, i) => ({ title: c.title, index: i }));
    }

    if (book.format === 'epub') {
      const chapters = await this.parseEpubChapters(book.filePath);
      return chapters.map((c) => ({ title: c.title, index: c.index }));
    }

    if (book.format === 'mobi' || book.format === 'azw3') {
      const chapters = await this.parseMobiChapters(book.filePath);
      return chapters.map((c) => ({ title: c.title, index: c.index }));
    }

    // For other formats, return a single chapter placeholder
    return [{ title: '全文', index: 0 }];
  }

  async getChapterContent(id: string, chapterIndex: number): Promise<{ title: string; content: string }> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
    });
    if (!book) throw new NotFoundException('Book not found');

    if (book.format === 'txt') {
      return this.getTxtChapterContent(book.filePath, chapterIndex);
    }

    if (book.format === 'epub') {
      return this.getEpubChapterContent(book.filePath, chapterIndex);
    }

    if (book.format === 'mobi' || book.format === 'azw3') {
      return this.getMobiChapterContent(book.filePath, chapterIndex);
    }

    throw new NotFoundException('Chapter content only supported for txt, epub, and mobi files');
  }

  private async getTxtChapterContent(filePath: string, chapterIndex: number): Promise<{ title: string; content: string }> {
    const chapters = await this.parseTxtChapters(filePath);
    if (chapterIndex < 0 || chapterIndex >= chapters.length) {
      throw new NotFoundException('Chapter not found');
    }

    const fullPath = this.resolveEbookPath(filePath);
    const text = await this.readTextFile(fullPath);
    const lines = text.split(/\r?\n/);

    const startLine = chapters[chapterIndex].startLine;
    const endLine = chapterIndex + 1 < chapters.length
      ? chapters[chapterIndex + 1].startLine
      : lines.length;

    const contentLines = lines.slice(startLine + 1, endLine); // skip chapter title line
    const content = contentLines.join('\n').trim();

    return {
      title: chapters[chapterIndex].title,
      content: content || '(本章无内容)',
    };
  }

  // ─── EPUB Parsing ────────────────────────────────────────────────────────

  private async parseEpubChapters(filePath: string): Promise<{ title: string; id: string; index: number }[]> {
    const fullPath = this.resolveEbookPath(filePath);
    if (!existsSync(fullPath)) return [];

    try {
      const epub = new EPub(fullPath);
      await epub.parse();

      // Use TOC for chapter titles, fallback to spine order
      const tocMap = new Map<string, string>();
      for (const tocItem of epub.toc) {
        // href may contain fragment like "chapter1.xhtml#section1"
        const baseHref = tocItem.href.split('#')[0];
        if (!tocMap.has(baseHref) || tocItem.level === 0) {
          tocMap.set(baseHref, tocItem.title);
        }
      }

      const chapters: { title: string; id: string; index: number }[] = [];
      for (let i = 0; i < epub.flow.length; i++) {
        const item = epub.flow[i];
        const href = item.href;
        const title = tocMap.get(href) || (item.title as string) || `第 ${i + 1} 章`;
        chapters.push({ title, id: item.id, index: i });
      }

      return chapters;
    } catch (err) {
      console.error('Failed to parse EPUB:', err);
      return [];
    }
  }

  // ─── Paragraph Extraction (TTS-friendly) ────────────────────────────────

  /**
   * Extract paragraphs from a chapter's HTML.
   * - splits the HTML on <p>, <h1>..<h6>, <li>, <blockquote>
   * - strips any remaining tags from each block
   * - skips blocks with empty / whitespace-only text
   * - returns stable ids of the form "p-<n>" and char offsets so the
   *   client can compute a progress bar.
   */
  private extractParagraphs(html: string): BookParagraph[] {
    if (!html) return [];
    const blockTag = '(?:p|h[1-6]|li|blockquote|div)';
    const re = new RegExp(`<${blockTag}\\b[^>]*>([\\s\\S]*?)<\\/${blockTag}>`, 'gi');
    const out: BookParagraph[] = [];
    let cursor = 0;
    let idx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const inner = m[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      if (!inner) continue;
      out.push({
        id: `p-${idx}`,
        index: idx,
        text: inner,
        charStart: cursor,
        charEnd: cursor + inner.length,
      });
      cursor += inner.length + 1;
      idx += 1;
    }
    return out;
  }

  /** Public entry point used by Reader-TTS. */
  async getChapterParagraphs(
    id: string,
    chapterIndex: number,
  ): Promise<{ title: string; paragraphs: BookParagraph[] }> {
    const book = await this.prisma.book.findUnique({ where: { id, isDeleted: false } });
    if (!book) throw new NotFoundException('Book not found');

    if (book.format === 'txt') {
      return this.getTxtChapterParagraphs(book.filePath, chapterIndex);
    }
    if (book.format === 'epub') {
      return this.getEpubChapterParagraphs(book.filePath, chapterIndex);
    }
    if (book.format === 'mobi' || book.format === 'azw3') {
      return this.getMobiChapterParagraphs(book.filePath, chapterIndex);
    }
    // Fallback: legacy content endpoint, split on blank lines.
    const { title, content } = await this.getChapterContent(id, chapterIndex);
    return {
      title,
      paragraphs: content
        .split(/\n\s*\n+/)
        .map((para, i) => ({ id: `p-${i}`, index: i, text: para.trim(), charStart: 0, charEnd: para.length }))
        .filter((p) => p.text.length > 0),
    };
  }

  private async getEpubChapterParagraphs(
    filePath: string,
    chapterIndex: number,
  ): Promise<{ title: string; paragraphs: BookParagraph[] }> {
    const fullPath = this.resolveEbookPath(filePath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('EPUB file not found');
    }
    try {
      const epub = new EPub(fullPath);
      await epub.parse();
      if (chapterIndex < 0 || chapterIndex >= epub.flow.length) {
        throw new NotFoundException('Chapter not found');
      }
      const item = epub.flow[chapterIndex];
      const rawHtml = await epub.getChapterRaw(item.id);
      const withImages = await this.inlineEpubImages(epub, rawHtml, item.href);
      const cleanContent = this.cleanEpubHtml(withImages, item.href);
      const paragraphs = this.extractParagraphs(cleanContent);
      let title = (item.title as string) || `第 ${chapterIndex + 1} 章`;
      const tocItem = epub.toc.find((t) => t.href.split('#')[0] === item.href);
      if (tocItem) title = tocItem.title as string;
      return { title, paragraphs };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      console.error('Failed to get EPUB paragraphs:', err);
      throw new NotFoundException('Failed to read EPUB chapter');
    }
  }

  private async getTxtChapterParagraphs(
    filePath: string,
    chapterIndex: number,
  ): Promise<{ title: string; paragraphs: BookParagraph[] }> {
    const chapters = await this.parseTxtChapters(filePath);
    if (chapterIndex < 0 || chapterIndex >= chapters.length) {
      throw new NotFoundException('Chapter not found');
    }
    const fullPath = this.resolveEbookPath(filePath);
    const text = await this.readTextFile(fullPath);
    const lines = text.split(/\r?\n/);
    const startLine = chapters[chapterIndex].startLine;
    const endLine =
      chapterIndex + 1 < chapters.length ? chapters[chapterIndex + 1].startLine : lines.length;
    const contentLines = lines.slice(startLine + 1, endLine);
    const body = contentLines.join('\n').trim();
    const blocks = body
      .split(/\n\s*\n+/)
      .map((b) => b.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const paragraphs: BookParagraph[] = [];
    let cursor = 0;
    blocks.forEach((b, i) => {
      paragraphs.push({ id: `p-${i}`, index: i, text: b, charStart: cursor, charEnd: cursor + b.length });
      cursor += b.length + 1;
    });
    return { title: chapters[chapterIndex].title, paragraphs };
  }

  private async getMobiChapterParagraphs(
    filePath: string,
    chapterIndex: number,
  ): Promise<{ title: string; paragraphs: BookParagraph[] }> {
    let mobi: any;
    const fullPath = this.resolveEbookPath(filePath);
    if (!existsSync(fullPath)) throw new NotFoundException('MOBI/AZW3 file not found');
    try {
      const parser = await getMobiParser();
      mobi = await parser.initMobiFile(fullPath);
      const spine = mobi.getSpine();
      if (chapterIndex < 0 || chapterIndex >= spine.length) {
        throw new NotFoundException('Chapter not found');
      }
      const chapterId = spine[chapterIndex].id;
      const chapter = mobi.loadChapter(chapterId);
      if (!chapter) throw new NotFoundException('Failed to load chapter');
      const cleanContent = this.cleanEpubHtml(chapter.html, '');
      const paragraphs = this.extractParagraphs(cleanContent);
      let title = `第 ${chapterIndex + 1} 章`;
      const toc = mobi.getToc();
      const resolved = mobi.resolveHref(chapterId);
      if (resolved) {
        const baseId = resolved.id;
        const findTitle = (items: any[]): string | undefined => {
          for (const item of items) {
            const itemBase = item.href.split('#')[0];
            if (itemBase === baseId || item.href === baseId) return item.label;
            if (item.children?.length) {
              const found = findTitle(item.children);
              if (found) return found;
            }
          }
          return undefined;
        };
        const tocTitle = findTitle(toc);
        if (tocTitle) title = tocTitle;
      }
      return { title, paragraphs };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      console.error('Failed to get MOBI paragraphs:', err);
      throw new NotFoundException('Failed to read MOBI/AZW3 chapter');
    } finally {
      if (mobi) {
        try { mobi.destroy(); } catch { /* ignore */ }
      }
    }
  }

  private async getEpubChapterContent(filePath: string, chapterIndex: number): Promise<{ title: string; content: string }> {
    const fullPath = this.resolveEbookPath(filePath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('EPUB file not found');
    }

    try {
      const epub = new EPub(fullPath);
      await epub.parse();

      if (chapterIndex < 0 || chapterIndex >= epub.flow.length) {
        throw new NotFoundException('Chapter not found');
      }

      const item = epub.flow[chapterIndex];
      // Use getChapterRaw (not getChapter) so the <img src="..."> attributes
      // survive: getChapter does a buggy relative-path rewrite that strips
      // the src entirely if the image's href doesn't match a manifest entry
      // by raw concatenation (which it never does for ../Images/foo.jpg
      // because the manifest stores the absolute-style href).
      const rawHtml = await epub.getChapterRaw(item.id);

      // Replace <img src="..."> references with inline data URIs so the
      // client can render images without any extra HTTP round-trips
      // (and without needing to know the EPUB's internal file layout).
      const withImages = await this.inlineEpubImages(epub, rawHtml, item.href);

      // Clean HTML for reading: remove scripts, styles, keep basic structure
      const cleanContent = this.cleanEpubHtml(withImages, item.href);

      // Try to get title from TOC
      let title = (item.title as string) || `第 ${chapterIndex + 1} 章`;
      const tocItem = epub.toc.find((t) => t.href.split('#')[0] === item.href);
      if (tocItem) {
        title = tocItem.title as string;
      }

      return {
        title,
        content: cleanContent || '(本章无内容)',
      };
    } catch (err) {
      console.error('Failed to get EPUB chapter:', err);
      throw new NotFoundException('Failed to read EPUB chapter');
    }
  }

  /**
   * Walk through the chapter HTML and replace every <img src="..."> with
   * a data URI. The chapter is identified by its href within the EPUB
   * (e.g. "OEBPS/Text/chapter1.xhtml"), and image srcs are resolved
   * relative to that chapter's parent directory.
   *
   * The EPub lib exposes image bytes via getImage(id); we look the id up
   * in the manifest by matching the resolved href.
   */
  private async inlineEpubImages(epub: any, html: string, chapterHref: string): Promise<string> {
    if (!html) return html;
    // Match <img ... src="..."> tags. Use a non-greedy match for the src
    // attribute; the tag itself may carry other attributes (alt, class, etc.)
    const imgRegex = /<img\b([^>]*?)\ssrc=(["'])([^"']+)\2([^>]*)>/gi;
    const matches: { match: string; prefix: string; src: string; suffix: string; quote: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(html)) !== null) {
      matches.push({
        match: m[0],
        prefix: m[1] || '',
        src: m[3],
        suffix: m[4] || '',
        quote: m[2],
      });
    }
    if (matches.length === 0) return html;

    // Build a quick lookup: archive-href -> manifest id
    const hrefToId = new Map<string, string>();
    for (const [id, info] of Object.entries<any>(epub.manifest || {})) {
      if (info && typeof info.href === 'string') {
        hrefToId.set(info.href, id);
      }
    }

    // The chapter's href may be e.g. "OEBPS/Text/chapter1.xhtml". The
    // base directory for resolving relative image paths is the chapter's
    // parent, e.g. "OEBPS/Text/".
    const baseDir = chapterHref.includes('/')
      ? chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1)
      : '';

    let result = html;
    for (const match of matches) {
      // Skip data URIs, absolute URLs, or already-resolved URLs
      if (
        /^(data:|https?:\/\/|blob:|file:)/i.test(match.src)
      ) {
        continue;
      }

      // Resolve the src against the chapter's base directory.
      const resolvedHref = this.resolveEpubPath(baseDir, match.src);
      const manifestId = hrefToId.get(resolvedHref);
      if (!manifestId) {
        // Image not in manifest (could be a remote URL, or path mismatch);
        // leave the original src so the WebView can try to load it.
        continue;
      }

      try {
        const { data, mimeType } = await epub.getImage(manifestId);
        const dataUri = `data:${mimeType};base64,${data.toString('base64')}`;
        const replacement = `<img${match.prefix} src=${match.quote}${dataUri}${match.quote}${match.suffix}>`;
        result = result.replace(match.match, replacement);
      } catch (err) {
        // If the image can't be read for any reason, fall back to the
        // original src so the chapter still renders.
        console.warn(`[epub] failed to inline image ${match.src}:`, (err as Error).message);
      }
    }
    return result;
  }

  /**
   * Resolve a relative href against a base directory, both expressed in
   * POSIX style (forward slashes). Handles ".." segments. Returns an
   * absolute-style path within the EPUB archive.
   */
  private resolveEpubPath(baseDir: string, relative: string): string {
    if (!relative) return baseDir;
    // Already absolute (rare for EPUB hrefs)
    if (relative.startsWith('/')) return relative.substring(1);

    const stack: string[] = baseDir.split('/').filter(Boolean);
    for (const seg of relative.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        stack.pop();
        continue;
      }
      stack.push(seg);
    }
    return stack.join('/');
  }

  /**
   * Clean EPUB HTML for reading:
   * - Remove scripts and event handlers
   * - Inline styles that break reading layout
   * - Keep basic text structure (p, h1-h6, img, etc.)
   */
  private cleanEpubHtml(html: string, baseHref: string): string {
    if (!html) return '';

    // Remove DOCTYPE, html, head, body tags - keep inner content
    let cleaned = html
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<html[^>]*>/gi, '')
      .replace(/<\/html>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<body[^>]*>/gi, '')
      .replace(/<\/body>/gi, '');

    // Remove scripts
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<script[^>]*\/>/gi, '');

    // Remove inline event handlers
    cleaned = cleaned.replace(/\son\w+="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\son\w+='[^']*'/gi, '');

    // Remove style tags (we'll apply reader's own styles)
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove class attributes that may conflict with reader styles
    cleaned = cleaned.replace(/\sclass="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\sclass='[^']*'/gi, '');

    // Remove id attributes (may conflict)
    cleaned = cleaned.replace(/\sid="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\sid='[^']*'/gi, '');

    // Remove style attributes
    cleaned = cleaned.replace(/\sstyle="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\sstyle='[^']*'/gi, '');

    // Clean up excessive whitespace
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');

    return cleaned.trim();
  }

  // ─── MOBI / AZW3 Parsing ─────────────────────────────────────────────────

  private async parseMobiChapters(filePath: string): Promise<{ title: string; id: string; index: number }[]> {
    const fullPath = this.resolveEbookPath(filePath);
    if (!existsSync(fullPath)) return [];

    let mobi: any;
    try {
      const parser = await getMobiParser();
      mobi = await parser.initMobiFile(fullPath);
      const spine = mobi.getSpine();
      const toc = mobi.getToc();

      // Build TOC map: href -> title
      const tocMap = new Map<string, string>();
      const walkToc = (items: any[]) => {
        for (const item of items) {
          const baseHref = item.href.split('#')[0];
          if (!tocMap.has(baseHref)) {
            tocMap.set(baseHref, item.label);
          }
          if (item.children && item.children.length > 0) {
            walkToc(item.children);
          }
        }
      };
      walkToc(toc);

      const chapters: { title: string; id: string; index: number }[] = [];
      for (let i = 0; i < spine.length; i++) {
        const item = spine[i];
        // For MOBI, try to resolve href from id to find TOC title
        let title: string | undefined;
        const resolved = mobi.resolveHref(item.id);
        if (resolved) {
          // resolved has { id, selector }, use id to match spine item
          const baseId = resolved.id;
          title = tocMap.get(baseId);
        }
        chapters.push({
          title: title || `第 ${i + 1} 章`,
          id: item.id,
          index: i,
        });
      }

      return chapters;
    } catch (err) {
      console.error('Failed to parse MOBI/AZW3:', err);
      return [];
    } finally {
      if (mobi) {
        try { mobi.destroy(); } catch { /* ignore */ }
      }
    }
  }

  private async getMobiChapterContent(filePath: string, chapterIndex: number): Promise<{ title: string; content: string }> {
    const fullPath = this.resolveEbookPath(filePath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('MOBI/AZW3 file not found');
    }

    let mobi: any;
    try {
      const parser = await getMobiParser();
      mobi = await parser.initMobiFile(fullPath);
      const spine = mobi.getSpine();

      if (chapterIndex < 0 || chapterIndex >= spine.length) {
        throw new NotFoundException('Chapter not found');
      }

      const chapterId = spine[chapterIndex].id;
      const chapter = mobi.loadChapter(chapterId);

      if (!chapter) {
        throw new NotFoundException('Failed to load chapter');
      }

      // Clean HTML for reading
      const cleanContent = this.cleanEpubHtml(chapter.html, '');

      // Try to get title from TOC
      let title = `第 ${chapterIndex + 1} 章`;
      const toc = mobi.getToc();
      const resolved = mobi.resolveHref(chapterId);
      if (resolved) {
        const baseId = resolved.id;
        const findTitle = (items: any[]): string | undefined => {
          for (const item of items) {
            // MOBI TOC href may be internal IDs like "_123" or "html#anchor"
            const itemBase = item.href.split('#')[0];
            if (itemBase === baseId || item.href === baseId) {
              return item.label;
            }
            if (item.children && item.children.length > 0) {
              const found = findTitle(item.children);
              if (found) return found;
            }
          }
          return undefined;
        };
        const tocTitle = findTitle(toc);
        if (tocTitle) title = tocTitle;
      }

      return {
        title,
        content: cleanContent || '(本章无内容)',
      };
    } catch (err) {
      console.error('Failed to get MOBI/AZW3 chapter:', err);
      throw new NotFoundException('Failed to read MOBI/AZW3 chapter');
    } finally {
      if (mobi) {
        try { mobi.destroy(); } catch { /* ignore */ }
      }
    }
  }

  async findAll(query: BookQueryDto, userId?: string): Promise<PaginatedBooksDto> {
    const { page = 1, limit = 20, search, format, author, authorId, language, sortBy = 'createdAt', order = 'desc' } = query;
    const skip = (page - 1) * limit;

    // Auto-scan local books if DB is empty
    const totalCount = await this.prisma.book.count({ where: { isDeleted: false } });
    if (totalCount === 0) {
      await this.scanLocalBooks();
    }

    const where: Record<string, unknown> = { isDeleted: false };
    if (format) where.format = format;
    if (language) where.language = language;
    if (author) where.author = { contains: author };
    if (search) {
      where.title = { contains: search };
    }

    const include: any = {
      bookTags: { include: { tag: true } },
    };
    if (authorId) {
      include.bookAuthors = {
        where: { authorId },
        include: { author: true },
      };
    } else {
      include.bookAuthors = {
        include: { author: true },
      };
    }

    const [books, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include,
      }),
      this.prisma.book.count({ where }),
    ]);

    const bookIds = books.map((b) => b.id);
    const progresses = userId && bookIds.length > 0
      ? await this.prisma.readingProgress.findMany({
          where: { userId, bookId: { in: bookIds } },
        })
      : [];
    const progressMap = new Map(progresses.map((p) => [p.bookId, p]));

    return {
      books: books.map((b) => this.toBookResponse(b, progressMap.get(b.id))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId?: string): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
      include: {
        bookTags: { include: { tag: true } },
        bookAuthors: {
          include: { author: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book with id ${id} not found`);
    }

    const progress = userId
      ? await this.prisma.readingProgress.findUnique({
          where: { userId_bookId: { userId, bookId: id } },
        })
      : null;

    return this.toBookResponse(book, progress);
  }

  async update(id: string, dto: UpdateBookDto): Promise<BookResponseDto> {
    const existing = await this.prisma.book.findUnique({ where: { id, isDeleted: false } });
    if (!existing) {
      throw new NotFoundException(`Book with id ${id} not found`);
    }

    const book = await this.prisma.book.update({
      where: { id },
      data: {
        ...dto,
        publishedDate: dto.publishedDate ? new Date(dto.publishedDate) : undefined,
      },
      include: { bookTags: { include: { tag: true } } },
    });

    return this.toBookResponse(book);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.book.findUnique({ where: { id, isDeleted: false } });
    if (!existing) {
      throw new NotFoundException(`Book with id ${id} not found`);
    }

    // Soft delete
    await this.prisma.book.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  /**
   * Full sync: scan all local books, add new ones, mark missing ones as deleted.
   * Also re-fetches metadata for all existing books.
   */
  async fullSync(): Promise<{ added: number; removed: number; updated: number }> {
    const ebookExts = ['txt', 'epub', 'pdf', 'mobi', 'azw3', 'fb2', 'djvu'];
    let added = 0;
    let removed = 0;
    let updated = 0;

    try {
      // 1. Collect all files on disk (across every configured NAS root)
      const entries = await this.collectEbookFilesRecursively(ebookExts);
      const filePathsOnDisk = new Set(entries.map((e) => e.filePath));

      // 2. Get all existing books from DB
      const existingBooks = await this.prisma.book.findMany({
        where: { isDeleted: false },
        select: { id: true, filePath: true, title: true },
      });
      const existingPaths = new Map(existingBooks.map((b) => [b.filePath, b]));

      // 3. Add new books
      for (const { filePath, rootPath } of entries) {
        if (existingPaths.has(filePath)) continue;

        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const fullPath = join(rootPath, filePath);
        const fileStat = await stat(fullPath);
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        const title = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

        const createdBook = await this.prisma.book.create({
          data: {
            title,
            author: 'Unknown',
            format: ext,
            filePath,
            fileSize: BigInt(fileStat.size),
            language: 'zh',
            metadata: '{}',
          },
        });
        this.filePathRootCache.set(filePath, rootPath);

        if (this.metadataService) {
          this.metadataService.fetchAndUpdateBook(createdBook.id).catch(() => {});
        }
        added++;
      }

      // 4. Mark missing books as deleted
      for (const book of existingBooks) {
        if (!filePathsOnDisk.has(book.filePath)) {
          await this.prisma.book.update({
            where: { id: book.id },
            data: { isDeleted: true },
          });
          removed++;
        }
      }

      // 5. Re-fetch metadata for all existing books
      for (const book of existingBooks) {
        if (filePathsOnDisk.has(book.filePath) && this.metadataService) {
          this.metadataService.fetchAndUpdateBook(book.id).catch(() => {});
          updated++;
        }
      }
    } catch {
      // ignore errors
    }

    return { added, removed, updated };
  }

  /**
   * Incremental sync: only add new books found on disk, no removal or metadata refresh.
   */
  async incrementalSync(): Promise<{ added: number }> {
    const ebookExts = ['txt', 'epub', 'pdf', 'mobi', 'azw3', 'fb2', 'djvu'];
    let added = 0;

    try {
      const entries = await this.collectEbookFilesRecursively(ebookExts);

      for (const { filePath, rootPath } of entries) {
        const existing = await this.prisma.book.findFirst({
          where: { filePath, isDeleted: false },
        });
        if (existing) {
          this.filePathRootCache.set(filePath, rootPath);
          continue;
        }

        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const fullPath = join(rootPath, filePath);
        const fileStat = await stat(fullPath);
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        const title = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

        const createdBook = await this.prisma.book.create({
          data: {
            title,
            author: 'Unknown',
            format: ext,
            filePath,
            fileSize: BigInt(fileStat.size),
            language: 'zh',
            metadata: '{}',
          },
        });
        this.filePathRootCache.set(filePath, rootPath);

        if (this.metadataService) {
          this.metadataService.fetchAndUpdateBook(createdBook.id).catch(() => {});
        }
        added++;
      }
    } catch {
      // ignore errors
    }

    return { added };
  }

  async getCover(id: string): Promise<{ stream: unknown; contentType: string }> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
      select: { coverUrl: true, filePath: true, title: true },
    });

    if (!book) {
      throw new NotFoundException(`Book with id ${id} not found`);
    }

    // Return cover URL or generate placeholder
    if (book.coverUrl) {
      // Proxy external cover
      return { stream: null, contentType: 'image/jpeg' };
    }

    // Generate SVG placeholder
    const svg = this.generateCoverPlaceholder(book.title, book.filePath);
    return { stream: Buffer.from(svg), contentType: 'image/svg+xml' };
  }

  async download(id: string): Promise<{ path: string; filename: string; contentType: string }> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
    });

    if (!book) {
      throw new NotFoundException(`Book with id ${id} not found`);
    }

    // Increment download count
    await this.prisma.book.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });

    const formatMimeTypes: Record<BookFormat, string> = {
      epub: 'application/epub+zip',
      pdf: 'application/pdf',
      mobi: 'application/x-mobipocket-ebook',
      azw3: 'application/vnd.amazon.ebook',
      fb2: 'application/fb2',
      txt: 'text/plain',
      djvu: 'image/vnd.djvu',
      other: 'application/octet-stream',
    };

    return {
      path: this.resolveEbookPath(book.filePath),
      filename: `${book.title}.${book.format}`,
      contentType: formatMimeTypes[book.format as BookFormat],
    };
  }

  async search(query: string, limit = 50, userId?: string): Promise<BookResponseDto[]> {
    const books = await this.prisma.book.findMany({
      where: {
        isDeleted: false,
        OR: [
          { title: { contains: query } },
          { author: { contains: query } },
          { description: { contains: query } },
        ],
      },
      take: limit,
      include: {
        bookTags: { include: { tag: true } },
      },
    });

    const bookIds = books.map((b) => b.id);
    const progresses = userId && bookIds.length > 0
      ? await this.prisma.readingProgress.findMany({
          where: { userId, bookId: { in: bookIds } },
        })
      : [];
    const progressMap = new Map(progresses.map((p) => [p.bookId, p]));

    return books.map((b) => this.toBookResponse(b, progressMap.get(b.id)));
  }

  async getStats(): Promise<BookStatsDto> {
    const [totalBooks, booksByFormat, totalSizeResult, recentBooks] = await Promise.all([
      this.prisma.book.count({ where: { isDeleted: false } }),
      this.prisma.book.groupBy({
        by: ['format'],
        _count: { id: true },
        where: { isDeleted: false },
      }),
      this.prisma.book.aggregate({
        _sum: { fileSize: true },
        where: { isDeleted: false },
      }),
      this.prisma.book.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { bookTags: { include: { tag: true } } },
      }),
    ]);

    const totalFormats: Record<string, number> = {};
    for (const f of booksByFormat) {
      totalFormats[f.format] = f._count.id;
    }

    return {
      totalBooks,
      totalFormats,
      totalSize: totalSizeResult._sum.fileSize || BigInt(0),
      recentBooks: recentBooks.map((b) => this.toBookResponse(b)),
    };
  }

  async addTag(bookId: string, tagName: string, userId: string): Promise<BookResponseDto> {
    // Ensure tag exists
    let tag = await this.prisma.tag.findUnique({ where: { name: tagName } });
    if (!tag) {
      tag = await this.prisma.tag.create({ data: { name: tagName } });
    }

    // Link tag to book
    await this.prisma.bookTag.upsert({
      where: { bookId_tagId: { bookId, tagId: tag.id } },
      create: { bookId, tagId: tag.id },
      update: {},
    });

    return this.findOne(bookId);
  }

  async removeTag(bookId: string, tagName: string): Promise<BookResponseDto> {
    const tag = await this.prisma.tag.findUnique({ where: { name: tagName } });
    if (tag) {
      await this.prisma.bookTag.deleteMany({
        where: { bookId, tagId: tag.id },
      });
    }
    return this.findOne(bookId);
  }

  private toBookResponse(book: any, progress?: any): BookResponseDto & { fileType: string; addedAt: Date } {
    const authors = book.bookAuthors?.map((ba: any) => ({
      id: ba.author.id,
      name: ba.author.name,
      nameSort: ba.author.nameSort,
      avatarUrl: ba.author.avatarUrl,
    })) || [];

    return {
      id: book.id,
      title: book.title,
      author: book.author || undefined,
      authors: authors.length > 0 ? authors : undefined,
      description: book.description || undefined,
      isbn: book.isbn || undefined,
      publisher: book.publisher || undefined,
      publishedDate: book.publishedDate || undefined,
      language: book.language,
      format: book.format,
      fileType: book.format,
      filePath: book.filePath,
      fileHash: book.fileHash || undefined,
      fileSize: book.fileSize ? Number(book.fileSize) : undefined,
      pageCount: book.pageCount || undefined,
      coverUrl: book.coverUrl || undefined,
      metadata: book.metadata || {},
      readCount: book.readCount,
      downloadCount: book.downloadCount,
      createdAt: book.createdAt,
      addedAt: book.createdAt,
      updatedAt: book.updatedAt,
      tags: book.bookTags?.map((bt: any) => bt.tag.name) || [],
      readingProgress: progress ? progress.progressPct : undefined,
      currentPage: progress ? progress.currentChapter : undefined,
      lastReadAt: progress ? progress.lastReadAt : undefined,
    } as any;
  }

  private generateCoverPlaceholder(title: string, filePath: string): string {
    const colors = ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#2c3e50'];
    const color = colors[title.charCodeAt(0) % colors.length];
    const initials = title.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
      <rect width="400" height="600" fill="${color}"/>
      <text x="200" y="300" text-anchor="middle" fill="white" font-size="120" font-family="Arial">${initials}</text>
      <text x="200" y="500" text-anchor="middle" fill="white" font-size="24" font-family="Arial">${title.substring(0, 30)}</text>
    </svg>`;
  }
}
// T7 completed
