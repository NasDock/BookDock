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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ReadingStatus } from '@prisma/client';

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
