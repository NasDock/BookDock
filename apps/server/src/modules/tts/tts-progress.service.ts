/**
 * TTS Reading Progress — server-side persistence of "where the user is"
 * in a book's audio narration. One row per (user, book, chapter);
 * upserted on every paragraph change / pause / exit.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    SaveTtsProgressDto,
    TtsProgressResponseDto,
} from './dto/tts-progress.dto';

@Injectable()
export class TtsProgressService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async save(userId: string, dto: SaveTtsProgressDto): Promise<TtsProgressResponseDto> {
    const row = await this.prisma.ttsReadingProgress.upsert({
      where: {
        userId_bookId_chapterIndex: {
          userId,
          bookId: dto.bookId,
          chapterIndex: dto.chapterIndex,
        },
      },
      create: {
        userId,
        bookId: dto.bookId,
        chapterIndex: dto.chapterIndex,
        paragraphIndex: dto.paragraphIndex,
        charOffset: dto.charOffset ?? 0,
        audioOffsetMs: dto.audioOffsetMs ?? 0,
        voice: dto.voice,
        provider: dto.provider,
        totalParagraphs: dto.totalParagraphs ?? 0,
      },
      update: {
        paragraphIndex: dto.paragraphIndex,
        charOffset: dto.charOffset ?? 0,
        audioOffsetMs: dto.audioOffsetMs ?? 0,
        voice: dto.voice,
        provider: dto.provider,
        totalParagraphs: dto.totalParagraphs ?? 0,
      },
    });
    return this.toDto(row);
  }

  async get(
    userId: string,
    bookId: string,
    chapterIndex?: number,
  ): Promise<TtsProgressResponseDto | null> {
    const where: any = { userId, bookId };
    if (typeof chapterIndex === 'number') where.chapterIndex = chapterIndex;
    const row = await this.prisma.ttsReadingProgress.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return row ? this.toDto(row) : null;
  }

  async getAllForBook(userId: string, bookId: string): Promise<TtsProgressResponseDto[]> {
    const rows = await this.prisma.ttsReadingProgress.findMany({
      where: { userId, bookId },
      orderBy: { chapterIndex: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async delete(userId: string, bookId: string, chapterIndex?: number): Promise<void> {
    const where: any = { userId, bookId };
    if (typeof chapterIndex === 'number') where.chapterIndex = chapterIndex;
    await this.prisma.ttsReadingProgress.deleteMany({ where });
  }

  private toDto(row: any): TtsProgressResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      bookId: row.bookId,
      chapterIndex: row.chapterIndex,
      paragraphIndex: row.paragraphIndex,
      charOffset: row.charOffset,
      audioOffsetMs: row.audioOffsetMs,
      voice: row.voice || undefined,
      provider: row.provider || undefined,
      totalParagraphs: row.totalParagraphs,
      updatedAt: row.updatedAt,
    };
  }
}
