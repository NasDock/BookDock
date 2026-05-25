import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, Book } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { BookMetadataService } from '../book-metadata/book-metadata.service';

import { createReadStream, statSync, existsSync } from 'fs';
import { readdir, stat, readFile, rename } from 'fs/promises';
import { join } from 'path';
import * as iconv from 'iconv-lite';
import { BookFormat } from '../../common/types/prisma-compat';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
  CreateBookDto,
  UpdateBookDto,
  BookQueryDto,
  BookResponseDto,
  PaginatedBooksDto,
  BookStatsDto,
} from './dto/books.dto';

@Injectable()
export class BooksService implements OnModuleInit {
  private readonly nasEbookPath: string;
  private readonly apiBaseUrl: string;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly metadataService?: BookMetadataService, // T7: optional metadata service
  ) {
    this.nasEbookPath = this.configService.get<string>('app.nasEbookPath') || '/data/ebooks';
    this.apiBaseUrl = this.configService.get<string>('app.apiBaseUrl') || 'http://localhost:3000';
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

    const fullPath = join(this.nasEbookPath, dto.filePath);
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
    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    const ebookExts = ['txt', 'epub', 'pdf', 'mobi', 'azw3', 'fb2', 'djvu'];
    if (!ebookExts.includes(ext)) {
      throw new Error(`不支持的文件格式: ${ext}`);
    }

    const destPath = join(this.nasEbookPath, file.originalname);

    // If file already exists, append a number
    let finalFileName = file.originalname;
    let finalDestPath = destPath;
    let counter = 1;
    while (existsSync(finalDestPath)) {
      const nameWithoutExt = file.originalname.replace(/\.[^/.]+$/, '');
      finalFileName = `${nameWithoutExt} (${counter}).${ext}`;
      finalDestPath = join(this.nasEbookPath, finalFileName);
      counter++;
    }

    await rename(file.path, finalDestPath);

    const fileStat = statSync(finalDestPath);
    const title = finalFileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

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

  async scanLocalBooks(): Promise<number> {
    const ebookExts = ['txt', 'epub', 'pdf', 'mobi', 'azw3', 'fb2', 'djvu'];
    let added = 0;

    try {
      const entries = await this.collectEbookFilesRecursively(this.nasEbookPath, ebookExts);
      for (const filePath of entries) {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const existing = await this.prisma.book.findFirst({
          where: { filePath, isDeleted: false },
        });
        if (existing) continue;

        const fullPath = join(this.nasEbookPath, filePath);
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

  private async collectEbookFilesRecursively(basePath: string, ebookExts: string[], relativePath = ''): Promise<string[]> {
    const currentPath = relativePath ? join(basePath, relativePath) : basePath;
    const entries = await readdir(currentPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const nextRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;
      if (entry.isDirectory()) {
        const nestedFiles = await this.collectEbookFilesRecursively(basePath, ebookExts, nextRelativePath);
        files.push(...nestedFiles);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      if (ebookExts.includes(ext)) {
        files.push(nextRelativePath);
      }
    }

    return files;
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
    const fullPath = join(this.nasEbookPath, filePath);
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

    // For non-txt, return a single chapter placeholder
    return [{ title: '全文', index: 0 }];
  }

  async getChapterContent(id: string, chapterIndex: number): Promise<{ title: string; content: string }> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
    });
    if (!book) throw new NotFoundException('Book not found');

    if (book.format !== 'txt') {
      throw new NotFoundException('Chapter content only supported for txt files');
    }

    const chapters = await this.parseTxtChapters(book.filePath);
    if (chapterIndex < 0 || chapterIndex >= chapters.length) {
      throw new NotFoundException('Chapter not found');
    }

    const fullPath = join(this.nasEbookPath, book.filePath);
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

  async findAll(query: BookQueryDto, userId?: string): Promise<PaginatedBooksDto> {
    const { page = 1, limit = 20, search, format, author, language, sortBy = 'createdAt', order = 'desc' } = query;
    const skip = (page - 1) * limit;

    // Auto-scan local books if DB is empty
    const totalCount = await this.prisma.book.count({ where: { isDeleted: false } });
    if (totalCount === 0) {
      await this.scanLocalBooks();
    }

    const where: Record<string, unknown> = { isDeleted: false };
    if (format) where.format = format;
    if (language) where.language = language;
    if (author) where.author = { contains: author, mode: 'insensitive' };
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [books, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include: {
          bookTags: { include: { tag: true } },
        },
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
      // 1. Collect all files on disk
      const entries = await this.collectEbookFilesRecursively(this.nasEbookPath, ebookExts);
      const filePathsOnDisk = new Set(entries);

      // 2. Get all existing books from DB
      const existingBooks = await this.prisma.book.findMany({
        where: { isDeleted: false },
        select: { id: true, filePath: true, title: true },
      });
      const existingPaths = new Map(existingBooks.map((b) => [b.filePath, b]));

      // 3. Add new books
      for (const filePath of entries) {
        if (existingPaths.has(filePath)) continue;

        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const fullPath = join(this.nasEbookPath, filePath);
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
      const entries = await this.collectEbookFilesRecursively(this.nasEbookPath, ebookExts);

      for (const filePath of entries) {
        const existing = await this.prisma.book.findFirst({
          where: { filePath, isDeleted: false },
        });
        if (existing) continue;

        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const fullPath = join(this.nasEbookPath, filePath);
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
      path: join(this.nasEbookPath, book.filePath),
      filename: `${book.title}.${book.format}`,
      contentType: formatMimeTypes[book.format as BookFormat],
    };
  }

  async search(query: string, limit = 50, userId?: string): Promise<BookResponseDto[]> {
    const books = await this.prisma.$queryRaw<
      Array<{
        id: string; title: string; author: string | null; description: string | null;
        cover_url: string | null; format: string; language: string;
      }>
    >`
      SELECT id, title, author, description, cover_url, format, language
      FROM books
      WHERE is_deleted = false
        AND (title ILIKE ${'%' + query + '%'}
          OR author ILIKE ${'%' + query + '%'}
          OR description ILIKE ${'%' + query + '%'})
      LIMIT ${limit}
    `;

    const bookIds = books.map((b) => b.id);
    const progresses = userId && bookIds.length > 0
      ? await this.prisma.readingProgress.findMany({
          where: { userId, bookId: { in: bookIds } },
        })
      : [];
    const progressMap = new Map(progresses.map((p) => [p.bookId, p]));

    return books.map((b) => {
      const p = progressMap.get(b.id);
      return {
        id: b.id,
        title: b.title,
        author: b.author || undefined,
        description: b.description || undefined,
        coverUrl: b.cover_url || undefined,
        format: b.format as BookFormat,
        language: b.language,
        filePath: '',
        metadata: {},
        readCount: 0,
        downloadCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        readingProgress: p ? p.progressPct : undefined,
        currentPage: p ? p.currentChapter : undefined,
        lastReadAt: p ? p.lastReadAt : undefined,
      };
    });
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
    return {
      id: book.id,
      title: book.title,
      author: book.author || undefined,
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
