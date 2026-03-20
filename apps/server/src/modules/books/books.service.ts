import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient, Book, BookFormat } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createReadStream, statSync, existsSync } from 'fs';
import { join } from 'path';
import { PRISMA_CLIENT } from '../../../config/database.module';
import {
  CreateBookDto,
  UpdateBookDto,
  BookQueryDto,
  BookResponseDto,
  PaginatedBooksDto,
  BookStatsDto,
} from './dto/books.dto';

@Injectable()
export class BooksService {
  private readonly nasEbookPath: string;
  private readonly apiBaseUrl: string;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    this.nasEbookPath = this.configService.get<string>('app.nasEbookPath') || '/data/ebooks';
    this.apiBaseUrl = this.configService.get<string>('app.apiBaseUrl') || 'http://localhost:3000';
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
        return new Promise((resolve, reject) => {
          createReadStream(fullPath)
            .on('data', (chunk) => hash.update(chunk))
            .on('end', () => {
              fileHash = hash.digest('hex');
              const stats = statSync(fullPath);
              fileSize = BigInt(stats.size);
              resolve(null);
            })
            .on('error', reject);
        }).then(() => undefined);
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

  async findAll(query: BookQueryDto): Promise<PaginatedBooksDto> {
    const { page = 1, limit = 20, search, format, author, language, sortBy = 'createdAt', order = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isDeleted: false };
    if (format) where.format = format;
    if (language) where.language = language;
    if (author) where.author = { contains: author, mode: 'insensitive' };
    if (search) {
      where.ftsVector = { search };
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

    return {
      data: books.map((b) => this.toBookResponse(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
      include: {
        bookTags: { include: { tag: true } },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book with id ${id} not found`);
    }

    return this.toBookResponse(book);
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

  async getCover(id: string): Promise<{ stream: unknown; contentType: string }> {
    const book = await this.prisma.book.findUnique({
      where: { id, isDeleted: false },
      select: { coverUrl: true, filePath: true },
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
      contentType: formatMimeTypes[book.format],
    };
  }

  async search(query: string, limit = 50): Promise<BookResponseDto[]> {
    const books = await this.prisma.$queryRaw<
      Array<{
        id: string; title: string; author: string | null; description: string | null;
        cover_url: string | null; format: BookFormat; language: string;
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

    return books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author || undefined,
      description: b.description || undefined,
      coverUrl: b.cover_url || undefined,
      format: b.format,
      language: b.language,
      filePath: '',
      metadata: {},
      readCount: 0,
      downloadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
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

  private toBookResponse(book: any): BookResponseDto {
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
      filePath: book.filePath,
      fileHash: book.fileHash || undefined,
      fileSize: book.fileSize || undefined,
      pageCount: book.pageCount || undefined,
      coverUrl: book.coverUrl || undefined,
      metadata: book.metadata || {},
      readCount: book.readCount,
      downloadCount: book.downloadCount,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      tags: book.bookTags?.map((bt: any) => bt.tag.name) || [],
    };
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
