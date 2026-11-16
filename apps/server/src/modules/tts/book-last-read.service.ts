/**
 * BookLastRead — global "where the user last listened" pointer.
 *
 * One row per (user, book). Upserted on every paragraph change / pause /
 * exit. Used by the book detail page's "继续听书" button and as the
 * default resume target for cross-device deep links.
 *
 * Distinct from `TtsReadingProgress` (per-chapter progress). This row
 * is what `GET /books/:id/last-read` returns; it's intentionally
 * lightweight (no per-chapter history).
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    BookLastReadResponseDto,
    SaveBookLastReadDto,
} from './dto/book-last-read.dto';

@Injectable()
export class BookLastReadService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async save(userId: string, dto: SaveBookLastReadDto): Promise<BookLastReadResponseDto> {
    const row = await this.prisma.bookLastRead.upsert({
      where: {
        userId_bookId: { userId, bookId: dto.bookId },
      },
      create: {
        userId,
        bookId: dto.bookId,
        chapterIndex: dto.chapterIndex,
        paragraphIndex: dto.paragraphIndex ?? 0,
        audioOffsetMs: dto.audioOffsetMs ?? 0,
      },
      update: {
        chapterIndex: dto.chapterIndex,
        paragraphIndex: dto.paragraphIndex ?? 0,
        audioOffsetMs: dto.audioOffsetMs ?? 0,
      },
    });
    return this.toDto(row);
  }

  async get(userId: string, bookId: string): Promise<BookLastReadResponseDto | null> {
    const row = await this.prisma.bookLastRead.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    return row ? this.toDto(row) : null;
  }

  async delete(userId: string, bookId: string): Promise<void> {
    await this.prisma.bookLastRead.deleteMany({ where: { userId, bookId } });
  }

  private toDto(row: any): BookLastReadResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      bookId: row.bookId,
      chapterIndex: row.chapterIndex,
      paragraphIndex: row.paragraphIndex,
      audioOffsetMs: row.audioOffsetMs,
      updatedAt: row.updatedAt,
    };
  }
}