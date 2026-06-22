import {
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    BookBookmarkDto,
    BookmarkResponseDto,
    ReadingProgressQueryDto,
    ReadingProgressResponseDto,
    ReadingStatsDto,
    UpdateReadingProgressDto,
    RecordReadingSessionDto,
    ReadingTimeSummaryDto,
    PeriodReadingStatsDto,
    DailyHourStatsDto,
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

    let status = dto.status;
    if (!status) {
      if (dto.progressPct !== undefined) {
        status = dto.progressPct >= 100 ? 'completed' : dto.progressPct > 0 ? 'reading' : 'unread';
      } else {
        status = 'reading';
      }
    }

    // Build update data
    const updateData: any = {
      status,
      lastReadAt: new Date(),
    };
    if (dto.epubCfi !== undefined) updateData.epubCfi = dto.epubCfi;
    if (dto.pdfPage !== undefined) updateData.pdfPage = dto.pdfPage;
    if (dto.mobiLocation !== undefined) updateData.mobiLocation = dto.mobiLocation;
    if (dto.bookmarkNote !== undefined) updateData.bookmarkNote = dto.bookmarkNote;
    if (dto.progressPct !== undefined) updateData.progressPct = dto.progressPct;
    if (dto.currentChapter !== undefined) updateData.currentChapter = dto.currentChapter;
    if (dto.scrollOffset !== undefined) updateData.scrollOffset = dto.scrollOffset;
    // Increment timeSpentSecs if durationSecs provided
    if (dto.durationSecs && dto.durationSecs > 0) {
      updateData.timeSpentSecs = { increment: dto.durationSecs };
    }

    const progress = await this.prisma.readingProgress.upsert({
      where: { userId_bookId: { userId, bookId } },
      create: {
        userId,
        bookId,
        status,
        epubCfi: dto.epubCfi,
        pdfPage: dto.pdfPage,
        mobiLocation: dto.mobiLocation,
        bookmarkNote: dto.bookmarkNote,
        progressPct: dto.progressPct ?? 0,
        currentChapter: dto.currentChapter ?? 0,
        scrollOffset: dto.scrollOffset ?? 0,
        timeSpentSecs: dto.durationSecs ?? 0,
        lastReadAt: new Date(),
      },
      update: updateData,
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
      // Return default progress for first-time readers
      return {
        id: '',
        bookId,
        status: 'unread',
        progressPct: 0,
        currentChapter: 0,
        scrollOffset: 0,
        epubCfi: undefined,
        timeSpentSecs: 0,
        lastReadAt: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
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
      this.prisma.readingProgress.count({ where: { userId, status: 'completed' } }),
      this.prisma.readingProgress.count({ where: { userId, status: 'reading' } }),
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

  // ── Reading Session Methods ───────────────────────────────────────────────

  async recordSession(
    userId: string,
    dto: RecordReadingSessionDto,
  ): Promise<{ success: boolean; message: string }> {
    const book = await this.prisma.book.findUnique({ where: { id: dto.bookId, isDeleted: false } });
    if (!book) throw new NotFoundException(`Book ${dto.bookId} not found`);

    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hour = dto.hour ?? now.getHours();

    await this.prisma.readingSession.create({
      data: {
        userId,
        bookId: dto.bookId,
        durationSecs: dto.durationSecs,
        date,
        hour,
      },
    });

    // Also update the cumulative timeSpentSecs in ReadingProgress
    await this.prisma.readingProgress.upsert({
      where: { userId_bookId: { userId, bookId: dto.bookId } },
      create: {
        userId,
        bookId: dto.bookId,
        status: 'reading',
        timeSpentSecs: dto.durationSecs,
        lastReadAt: now,
      },
      update: {
        timeSpentSecs: { increment: dto.durationSecs },
        lastReadAt: now,
      },
    });

    return { success: true, message: 'Reading session recorded' };
  }

  async getReadingTimeSummary(userId: string): Promise<ReadingTimeSummaryDto> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); // Monday
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [todayRes, weekRes, monthRes, yearRes, totalRes] = await Promise.all([
      this.prisma.readingSession.aggregate({
        _sum: { durationSecs: true },
        where: { userId, date: today },
      }),
      this.prisma.readingSession.aggregate({
        _sum: { durationSecs: true },
        where: { userId, date: { gte: weekStart.toISOString().split('T')[0] } },
      }),
      this.prisma.readingSession.aggregate({
        _sum: { durationSecs: true },
        where: { userId, date: { gte: monthStart.toISOString().split('T')[0] } },
      }),
      this.prisma.readingSession.aggregate({
        _sum: { durationSecs: true },
        where: { userId, date: { gte: yearStart.toISOString().split('T')[0] } },
      }),
      this.prisma.readingSession.aggregate({
        _sum: { durationSecs: true },
        where: { userId },
      }),
    ]);

    return {
      todaySecs: todayRes._sum.durationSecs || 0,
      weekSecs: weekRes._sum.durationSecs || 0,
      monthSecs: monthRes._sum.durationSecs || 0,
      yearSecs: yearRes._sum.durationSecs || 0,
      totalSecs: totalRes._sum.durationSecs || 0,
    };
  }

  async getPeriodStats(
    userId: string,
    period: 'day' | 'week' | 'month' | 'year',
    refDate?: string,
  ): Promise<PeriodReadingStatsDto> {
    const date = refDate || new Date().toISOString().split('T')[0];
    const d = new Date(date);

    let startDate: Date;
    let endDate: Date;
    let labels: string[] = [];
    let dateKeys: string[] = [];

    switch (period) {
      case 'day': {
        startDate = new Date(d);
        endDate = new Date(d);
        endDate.setDate(endDate.getDate() + 1);
        labels = Array.from({ length: 24 }, (_, i) => `${i}时`);
        dateKeys = [date];
        break;
      }
      case 'week': {
        const dayOfWeek = d.getDay() || 7;
        startDate = new Date(d);
        startDate.setDate(d.getDate() - dayOfWeek + 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
        labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        dateKeys = Array.from({ length: 7 }, (_, i) => {
          const dd = new Date(startDate);
          dd.setDate(dd.getDate() + i);
          return dd.toISOString().split('T')[0];
        });
        break;
      }
      case 'month': {
        startDate = new Date(d.getFullYear(), d.getMonth(), 1);
        endDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}日`);
        dateKeys = Array.from({ length: daysInMonth }, (_, i) => {
          const dd = new Date(d.getFullYear(), d.getMonth(), i + 1);
          return dd.toISOString().split('T')[0];
        });
        break;
      }
      case 'year': {
        startDate = new Date(d.getFullYear(), 0, 1);
        endDate = new Date(d.getFullYear() + 1, 0, 1);
        labels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        dateKeys = Array.from({ length: 12 }, (_, i) => {
          const dd = new Date(d.getFullYear(), i, 1);
          return dd.toISOString().split('T')[0].slice(0, 7); // YYYY-MM
        });
        break;
      }
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const sessions = await this.prisma.readingSession.groupBy({
      by: ['date'],
      _sum: { durationSecs: true },
      where: {
        userId,
        date: { gte: startDateStr, lt: endDateStr },
      },
    });

    const sessionMap = new Map(sessions.map((s) => [s.date, s._sum.durationSecs || 0]));

    const breakdown = labels.map((label, i) => {
      const key = period === 'year' ? dateKeys[i] : dateKeys[i];
      const durationSecs = period === 'year'
        ? (sessionMap.get(key) || 0)
        : (sessionMap.get(dateKeys[i]) || 0);
      return { label, durationSecs, date: key };
    });

    const totalDurationSecs = breakdown.reduce((sum, b) => sum + b.durationSecs, 0);

    // Count unique books in this period
    const bookCount = await this.prisma.readingSession.groupBy({
      by: ['bookId'],
      where: {
        userId,
        date: { gte: startDateStr, lt: endDateStr },
      },
    }).then((groups) => groups.length);

    return {
      period,
      totalDurationSecs,
      bookCount,
      breakdown,
    };
  }

  async getDailyHourStats(
    userId: string,
    date?: string,
  ): Promise<DailyHourStatsDto> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const sessions = await this.prisma.readingSession.groupBy({
      by: ['hour'],
      _sum: { durationSecs: true },
      where: { userId, date: targetDate },
    });

    const sessionMap = new Map(sessions.map((s) => [s.hour, s._sum.durationSecs || 0]));

    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      durationSecs: sessionMap.get(i) || 0,
    }));

    return { date: targetDate, hours };
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
      currentChapter: p.currentChapter ?? undefined,
      scrollOffset: p.scrollOffset ?? undefined,
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
