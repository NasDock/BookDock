import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
  CreateBookmarkDto,
  UpdateBookmarkDto,
  BookmarkResponseDto,
  CreateHighlightDto,
  UpdateHighlightDto,
  HighlightResponseDto,
  CreateNoteDto,
  UpdateNoteDto,
  NoteResponseDto,
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
        type: 'highlight',
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

  // ── Note CRUD ──────────────────────────────────────────────────────────────

  async createNote(
    userId: string,
    dto: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    const note = await this.prisma.bookmark.create({
      data: {
        userId,
        bookId: dto.bookId,
        chapterId: dto.chapterId,
        text: dto.text,
        note: dto.note,
        cfi: dto.cfi,
        location: dto.cfi || '',
        locationType: dto.cfi ? 'cfi' : 'percentage',
        percentage: dto.percentage,
        highlightColor: dto.color,
        author: dto.author,
        bookTitle: dto.bookTitle,
        type: 'note',
      },
    });

    return this.toNoteResponse(note);
  }

  async getNotes(
    userId: string,
    query: { page?: number; limit?: number; bookId?: string; author?: string },
  ): Promise<{ items: NoteResponseDto[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { userId, type: 'note' };
    if (query.bookId) where.bookId = query.bookId;
    if (query.author) where.author = { contains: query.author };

    const [items, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.bookmark.count({ where }),
    ]);

    return {
      items: items.map((n) => this.toNoteResponse(n)),
      total,
      page,
      limit,
    };
  }

  async getNotesByBook(
    userId: string,
    bookId: string,
  ): Promise<NoteResponseDto[]> {
    const notes = await this.prisma.bookmark.findMany({
      where: { userId, bookId, type: 'note' },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((n) => this.toNoteResponse(n));
  }

  async getNotesByAuthor(
    userId: string,
    author: string,
  ): Promise<NoteResponseDto[]> {
    const notes = await this.prisma.bookmark.findMany({
      where: { userId, type: 'note', author: { contains: author } },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((n) => this.toNoteResponse(n));
  }

  async updateNote(
    userId: string,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    const note = await this.prisma.bookmark.findUnique({
      where: { id: noteId },
    });

    if (!note) throw new NotFoundException(`Note ${noteId} not found`);
    if (note.userId !== userId) throw new ForbiddenException('Access denied');
    if (note.type !== 'note') throw new NotFoundException('Not a note');

    const updated = await this.prisma.bookmark.update({
      where: { id: noteId },
      data: {
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.color !== undefined && { highlightColor: dto.color }),
        ...(dto.text !== undefined && { text: dto.text }),
      },
    });

    return this.toNoteResponse(updated);
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const note = await this.prisma.bookmark.findUnique({
      where: { id: noteId },
    });

    if (!note) throw new NotFoundException(`Note ${noteId} not found`);
    if (note.userId !== userId) throw new ForbiddenException('Access denied');
    if (note.type !== 'note') throw new NotFoundException('Not a note');

    await this.prisma.bookmark.delete({ where: { id: noteId } });
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
      type: h.type,
      createdAt: h.createdAt,
    };
  }

  private toNoteResponse(n: any): NoteResponseDto {
    return {
      id: n.id,
      userId: n.userId,
      bookId: n.bookId,
      chapterId: n.chapterId,
      text: n.text,
      note: n.note,
      color: n.highlightColor,
      cfi: n.cfi,
      percentage: n.percentage,
      author: n.author,
      bookTitle: n.bookTitle,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }
}
