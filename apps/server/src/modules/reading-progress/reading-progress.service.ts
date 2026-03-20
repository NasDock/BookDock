import {
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaClient, ReadingStatus } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    BookBookmarkDto,
    BookmarkResponseDto,
    ReadingProgressQueryDto,
    ReadingProgressResponseDto,
    ReadingStatsDto,
    UpdateReadingProgressDto,
} from './dto/reading-progress.dto';

@Injectable()
export class ReadingProgressService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async upsert(
    userId: string,
    bookId: string,
    dto: UpdateReadingProgressDto,
  ): Promise<ReadingProgressResponseDto> {
    // Verify book exists
    const book = await this.prisma.book.findUnique({ where: { id: bookId, isDeleted: false } });
    if (!book) throw new NotFoundException(`Book ${bookId} not found`);

    const progress = await this.prisma.readingProgress.upsert({
      where: { userId_bookId: { userId, bookId } },
      create: {
        userId,
        bookId,
        status: dto.status || ReadingStatus.reading,
        epubCfi: dto.epubCfi,
        pdfPage: dto.pdfPage,
        mobiLocation: dto.mobiLocation,
        bookmarkNote: dto.bookmarkNote,
        progressPct: 0,
        lastReadAt: new Date(),
      },
      update: {
        ...(dto.status && { status: dto.status }),
        ...(dto.epubCfi !== undefined && { epubCfi: dto.epubCfi }),
        ...(dto.pdfPage !== undefined && { pdfPage: dto.pdfPage }),
        ...(dto.mobiLocation !== undefined && { mobiLocation: dto.mobiLocation }),
        ...(dto.bookmarkNote !== undefined && { bookmarkNote: dto.bookmarkNote }),
        lastReadAt: new Date(),
      },
      include: { book: { select: { id: true, title: true, author: true, coverUrl: true, format: true } } },
    });

    return this.toProgressResponse(progress);
  }

  async findAll(
    userId: string,
    query: ReadingProgressQueryDto,
  ): Promise<{ data: ReadingProgressResponseDto[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, status, bookId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (bookId) where.bookId = bookId;

    const [progress, total] = await Promise.all([
      this.prisma.readingProgress.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastReadAt: 'desc' },
        include: { book: { select: { id: true, title: true, author: true, coverUrl: true, format: true } } },
      }),
      this.prisma.readingProgress.count({ where }),
    ]);

    return {
      data: progress.map((p) => this.toProgressResponse(p)),
      total,
      page,
      limit,
    };
  }

  async findOne(userId: string, bookId: string): Promise<ReadingProgressResponseDto> {
    const progress = await this.prisma.readingProgress.findUnique({
      where: { userId_bookId: { userId, bookId } },
      include: { book: { select: { id: true, title: true, author: true, coverUrl: true, format: true } } },
    });

    if (!progress) {
      throw new NotFoundException(`Reading progress for book ${bookId} not found`);
    }

    return this.toProgressResponse(progress);
  }

  async sync(
    userId: string,
    bookId: string,
    items: UpdateReadingProgressDto[],
  ): Promise<ReadingProgressResponseDto[]> {
    const results: ReadingProgressResponseDto[] = [];
    for (const item of items) {
      const progress = await this.upsert(userId, bookId, item);
      results.push(progress);
    }
    return results;
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  async createBookmark(
    userId: string,
    bookId: string,
    dto: BookBookmarkDto,
  ): Promise<BookmarkResponseDto> {
    const book = await this.prisma.book.findUnique({ where: { id: bookId, isDeleted: false } });
    if (!book) throw new NotFoundException(`Book ${bookId} not found`);

    const bookmark = await this.prisma.bookmark.create({
      data: {
        userId,
        bookId,
        title: dto.title,
        location: dto.location,
        locationType: dto.locationType || 'cfi',
        note: dto.note,
        highlightText: dto.highlightText,
        highlightColor: dto.highlightColor,
      },
      include: { book: { select: { id: true, title: true, author: true } } },
    });

    return this.toBookmarkResponse(bookmark);
  }

  async findBookmarks(
    userId: string,
    bookId?: string,
  ): Promise<BookmarkResponseDto[]> {
    const where: Record<string, unknown> = { userId };
    if (bookId) where.bookId = bookId;

    const bookmarks = await this.prisma.bookmark.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { book: { select: { id: true, title: true, author: true } } },
    });

    return bookmarks.map((b) => this.toBookmarkResponse(b));
  }

  async updateBookmark(
    userId: string,
    bookmarkId: string,
    dto: Partial<BookBookmarkDto>,
  ): Promise<BookmarkResponseDto> {
    const existing = await this.prisma.bookmark.findUnique({ where: { id: bookmarkId, userId } });
    if (!existing) throw new NotFoundException(`Bookmark ${bookmarkId} not found`);

    const bookmark = await this.prisma.bookmark.update({
      where: { id: bookmarkId },
      data: dto,
      include: { book: { select: { id: true, title: true, author: true } } },
    });

    return this.toBookmarkResponse(bookmark);
  }

  async removeBookmark(userId: string, bookmarkId: string): Promise<void> {
    const existing = await this.prisma.bookmark.findUnique({ where: { id: bookmarkId, userId } });
    if (!existing) throw new NotFoundException(`Bookmark ${bookmarkId} not found`);

    await this.prisma.bookmark.delete({ where: { id: bookmarkId } });
  }

  async getStats(userId: string): Promise<ReadingStatsDto> {
    const [total, reading, totalTime, avgProgress] = await Promise.all([
      this.prisma.readingProgress.count({ where: { userId, status: ReadingStatus.completed } }),
      this.prisma.readingProgress.count({ where: { userId, status: ReadingStatus.reading } }),
      this.prisma.readingProgress.aggregate({ _sum: { timeSpentSecs: true }, where: { userId } }),
      this.prisma.readingProgress.aggregate({ _avg: { progressPct: true }, where: { userId } }),
    ]);

    return {
      totalBooksRead: total,
      currentlyReading: reading,
      totalTimeSpentSecs: totalTime._sum.timeSpentSecs || 0,
      averageProgressPct: Number(avgProgress._avg.progressPct) || 0,
    };
  }

  private toProgressResponse(p: any): ReadingProgressResponseDto {
    return {
      id: p.id,
      bookId: p.bookId,
      status: p.status,
      epubCfi: p.epubCfi || undefined,
      pdfPage: p.pdfPage || undefined,
      mobiLocation: p.mobiLocation || undefined,
      progressPct: Number(p.progressPct),
      timeSpentSecs: p.timeSpentSecs,
      lastReadAt: p.lastReadAt || undefined,
      bookmarkNote: p.bookmarkNote || undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      book: p.book ? {
        id: p.book.id,
        title: p.book.title,
        author: p.book.author || undefined,
        coverUrl: p.book.coverUrl || undefined,
        format: p.book.format,
      } : undefined,
    };
  }

  private toBookmarkResponse(b: any): BookmarkResponseDto {
    return {
      id: b.id,
      bookId: b.bookId,
      title: b.title || undefined,
      location: b.location,
      locationType: b.locationType,
      note: b.note || undefined,
      highlightText: b.highlightText || undefined,
      highlightColor: b.highlightColor || undefined,
      createdAt: b.createdAt,
      book: b.book ? { id: b.book.id, title: b.book.title, author: b.book.author || undefined } : undefined,
    };
  }
}
