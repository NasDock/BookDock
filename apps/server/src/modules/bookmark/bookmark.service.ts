import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
  CreateBookmarkDto,
  UpdateBookmarkDto,
  BookmarkResponseDto,
  CreateHighlightDto,
  UpdateHighlightDto,
  HighlightResponseDto,
} from './dto/bookmark.dto';

@Injectable()
export class BookmarkService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  // ── Bookmark CRUD ──────────────────────────────────────────────────────────

  async createBookmark(
    userId: string,
    dto: CreateBookmarkDto,
  ): Promise<BookmarkResponseDto> {
    const bookmark = await this.prisma.bookmark.create({
      data: {
        userId,
        bookId: dto.bookId,
        chapterId: dto.chapterId,
        location: dto.cfi || '',
        locationType: dto.cfi ? 'cfi' : 'percentage',
        note: dto.note,
        highlightColor: dto.color,
        percentage: dto.percentage,
      },
    });

    return this.toBookmarkResponse(bookmark);
  }

  async getBookmarks(
    userId: string,
    bookId: string,
  ): Promise<BookmarkResponseDto[]> {
    const bookmarks = await this.prisma.bookmark.findMany({
      where: { userId, bookId },
      orderBy: { createdAt: 'desc' },
    });

    return bookmarks.map((b) => this.toBookmarkResponse(b));
  }

  async getBookmark(
    userId: string,
    bookmarkId: string,
  ): Promise<BookmarkResponseDto> {
    const bookmark = await this.prisma.bookmark.findUnique({
      where: { id: bookmarkId },
    });

    if (!bookmark) throw new NotFoundException(`Bookmark ${bookmarkId} not found`);
    if (bookmark.userId !== userId) throw new ForbiddenException('Access denied');

    return this.toBookmarkResponse(bookmark);
  }

  async updateBookmark(
    userId: string,
    bookmarkId: string,
    dto: UpdateBookmarkDto,
  ): Promise<BookmarkResponseDto> {
    const bookmark = await this.prisma.bookmark.findUnique({
      where: { id: bookmarkId },
    });

    if (!bookmark) throw new NotFoundException(`Bookmark ${bookmarkId} not found`);
    if (bookmark.userId !== userId) throw new ForbiddenException('Access denied');

    const updated = await this.prisma.bookmark.update({
      where: { id: bookmarkId },
      data: {
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.color !== undefined && { highlightColor: dto.color }),
      },
    });

    return this.toBookmarkResponse(updated);
  }

  async deleteBookmark(userId: string, bookmarkId: string): Promise<void> {
    const bookmark = await this.prisma.bookmark.findUnique({
      where: { id: bookmarkId },
    });

    if (!bookmark) throw new NotFoundException(`Bookmark ${bookmarkId} not found`);
    if (bookmark.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.bookmark.delete({ where: { id: bookmarkId } });
  }

  // ── Highlight CRUD ─────────────────────────────────────────────────────────

  async createHighlight(
    userId: string,
    dto: CreateHighlightDto,
  ): Promise<HighlightResponseDto> {
    const highlight = await this.prisma.bookmark.create({
      data: {
        userId,
        bookId: dto.bookId,
        chapterId: dto.chapterId,
        cfi: dto.cfi,
        location: dto.cfi,
        locationType: 'cfi',
        startOffset: dto.startOffset,
        endOffset: dto.endOffset,
        text: dto.text,
        highlightColor: dto.color,
        note: dto.note,
      },
    });

    return this.toHighlightResponse(highlight);
  }

  async getHighlights(
    userId: string,
    bookId: string,
  ): Promise<HighlightResponseDto[]> {
    const highlights = await this.prisma.bookmark.findMany({
      where: {
        userId,
        bookId,
        // Only highlights have startOffset set
        startOffset: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    return highlights.map((h) => this.toHighlightResponse(h));
  }

  async updateHighlight(
    userId: string,
    highlightId: string,
    dto: UpdateHighlightDto,
  ): Promise<HighlightResponseDto> {
    const highlight = await this.prisma.bookmark.findUnique({
      where: { id: highlightId },
    });

    if (!highlight) throw new NotFoundException(`Highlight ${highlightId} not found`);
    if (highlight.userId !== userId) throw new ForbiddenException('Access denied');
    if (highlight.startOffset === null) throw new NotFoundException('Not a highlight');

    const updated = await this.prisma.bookmark.update({
      where: { id: highlightId },
      data: {
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.color !== undefined && { highlightColor: dto.color }),
      },
    });

    return this.toHighlightResponse(updated);
  }

  async deleteHighlight(userId: string, highlightId: string): Promise<void> {
    const highlight = await this.prisma.bookmark.findUnique({
      where: { id: highlightId },
    });

    if (!highlight) throw new NotFoundException(`Highlight ${highlightId} not found`);
    if (highlight.userId !== userId) throw new ForbiddenException('Access denied');
    if (highlight.startOffset === null) throw new NotFoundException('Not a highlight');

    await this.prisma.bookmark.delete({ where: { id: highlightId } });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private toBookmarkResponse(b: any): BookmarkResponseDto {
    return {
      id: b.id,
      userId: b.userId,
      bookId: b.bookId,
      chapterId: b.chapterId,
      cfi: b.location || b.cfi,
      percentage: b.percentage,
      note: b.note,
      color: b.highlightColor,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }

  private toHighlightResponse(h: any): HighlightResponseDto {
    return {
      id: h.id,
      userId: h.userId,
      bookId: h.bookId,
      chapterId: h.chapterId,
      cfi: h.cfi,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      text: h.text,
      color: h.highlightColor,
      note: h.note,
      createdAt: h.createdAt,
    };
  }
}
