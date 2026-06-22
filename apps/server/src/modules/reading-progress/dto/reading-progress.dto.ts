import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsNumber,
  MinLength,
  MaxLength,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReadingStatus } from '../../../common/types/prisma-compat';
import { Type } from 'class-transformer';

export class UpdateReadingProgressDto {
  @ApiPropertyOptional({ enum: ReadingStatus })
  @IsEnum(ReadingStatus)
  @IsOptional()
  status?: ReadingStatus;

  @ApiPropertyOptional({ description: 'EPUB CFI location' })
  @IsString()
  @IsOptional()
  epubCfi?: string;

  @ApiPropertyOptional({ description: 'PDF page number' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pdfPage?: number;

  @ApiPropertyOptional({ description: 'Mobi byte offset' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  mobiLocation?: number;

  @ApiPropertyOptional({ description: 'Bookmark note' })
  @IsString()
  @IsOptional()
  bookmarkNote?: string;

  @ApiPropertyOptional({ description: 'Overall progress percentage (0-100)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPct?: number;

  @ApiPropertyOptional({ description: 'Current chapter index (for txt/epub chapter-based reading)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  currentChapter?: number;

  @ApiPropertyOptional({ description: 'Scroll offset within current chapter (pixels)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  scrollOffset?: number;

  @ApiPropertyOptional({ description: 'Reading duration in seconds to add' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSecs?: number;
}

export class ReadingProgressQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ReadingStatus })
  @IsEnum(ReadingStatus)
  @IsOptional()
  status?: ReadingStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bookId?: string;
}

export class ReadingProgressResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookId: string;

  @ApiProperty({ enum: ReadingStatus })
  status: ReadingStatus;

  @ApiPropertyOptional()
  epubCfi?: string;

  @ApiPropertyOptional()
  pdfPage?: number;

  @ApiPropertyOptional()
  mobiLocation?: number;

  @ApiProperty()
  progressPct: number;

  @ApiPropertyOptional()
  currentChapter?: number;

  @ApiPropertyOptional()
  scrollOffset?: number;

  @ApiProperty()
  timeSpentSecs: number;

  @ApiPropertyOptional()
  lastReadAt?: Date;

  @ApiPropertyOptional()
  bookmarkNote?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  book?: {
    id: string;
    title: string;
    author?: string;
    coverUrl?: string;
    format: string;
  };
}

export class BookBookmarkDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  bookId?: string;

  @ApiProperty({ example: 'Chapter 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Format-specific location' })
  @IsString()
  location: string;

  @ApiPropertyOptional({ default: 'cfi' })
  @IsString()
  @IsOptional()
  locationType?: string = 'cfi';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ description: 'Highlighted text' })
  @IsString()
  @IsOptional()
  highlightText?: string;

  @ApiPropertyOptional({ example: 'yellow' })
  @IsString()
  @IsOptional()
  highlightColor?: string;
}

export class BookmarkResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookId: string;

  @ApiPropertyOptional()
  title?: string;

  @ApiProperty()
  location: string;

  @ApiProperty()
  locationType: string;

  @ApiPropertyOptional()
  note?: string;

  @ApiPropertyOptional()
  highlightText?: string;

  @ApiPropertyOptional()
  highlightColor?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  book?: {
    id: string;
    title: string;
    author?: string;
  };
}

export class SyncReadingDto {
  @ApiProperty({ type: [UpdateReadingProgressDto] })
  @IsArray()
  items: UpdateReadingProgressDto[];

  @ApiProperty()
  @IsUUID()
  bookId: string;
}

export class ReadingStatsDto {
  @ApiProperty()
  totalBooksRead: number;

  @ApiProperty()
  currentlyReading: number;

  @ApiProperty()
  totalTimeSpentSecs: number;

  @ApiProperty()
  averageProgressPct: number;
}

// ── Reading Session DTOs ─────────────────────────────────────────────────────

export class RecordReadingSessionDto {
  @ApiProperty({ description: 'Book ID' })
  @IsUUID()
  bookId: string;

  @ApiProperty({ description: 'Reading duration in seconds' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSecs: number;

  @ApiPropertyOptional({ description: 'Hour of day (0-23) for daily distribution' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  hour?: number;
}

export class ReadingStatsQueryDto {
  @ApiPropertyOptional({ enum: ['day', 'week', 'month', 'year'] })
  @IsEnum(['day', 'week', 'month', 'year'])
  @IsOptional()
  period?: 'day' | 'week' | 'month' | 'year' = 'week';

  @ApiPropertyOptional({ description: 'Reference date (YYYY-MM-DD), defaults to today' })
  @IsString()
  @IsOptional()
  date?: string;
}

export class PeriodReadingStatsDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  totalDurationSecs: number;

  @ApiProperty()
  bookCount: number;

  @ApiProperty({ type: [Object] })
  breakdown: Array<{
    label: string;
    durationSecs: number;
    date: string;
  }>;
}

export class DailyHourStatsDto {
  @ApiProperty()
  date: string;

  @ApiProperty({ type: [Object] })
  hours: Array<{
    hour: number;
    durationSecs: number;
  }>;
}

export class ReadingTimeSummaryDto {
  @ApiProperty()
  todaySecs: number;

  @ApiProperty()
  weekSecs: number;

  @ApiProperty()
  monthSecs: number;

  @ApiProperty()
  yearSecs: number;

  @ApiProperty()
  totalSecs: number;
}
