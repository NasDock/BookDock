import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
  IsUUID,
  MinLength,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BookFormat } from '@prisma/client';

export class CreateBookDto {
  @ApiProperty({ example: 'The Great Gatsby' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ example: 'F. Scott Fitzgerald' })
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '9780743273565' })
  @IsString()
  @IsOptional()
  isbn?: string;

  @ApiPropertyOptional({ example: 'Scribner' })
  @IsString()
  @IsOptional()
  publisher?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  publishedDate?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiProperty({ enum: BookFormat })
  @IsEnum(BookFormat)
  format: BookFormat;

  @ApiProperty()
  @IsString()
  filePath: string;
}

export class UpdateBookDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  isbn?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  publisher?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  publishedDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coverUrl?: string;
}

export class BookQueryDto {
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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: BookFormat })
  @IsEnum(BookFormat)
  @IsOptional()
  format?: BookFormat;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ default: 'desc' })
  @IsString()
  @IsOptional()
  order?: 'asc' | 'desc' = 'desc';
}

export class BookResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  author?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  isbn?: string;

  @ApiPropertyOptional()
  publisher?: string;

  @ApiPropertyOptional()
  publishedDate?: Date;

  @ApiProperty()
  language: string;

  @ApiProperty({ enum: BookFormat })
  format: BookFormat;

  @ApiProperty()
  filePath: string;

  @ApiPropertyOptional()
  fileHash?: string;

  @ApiPropertyOptional()
  fileSize?: bigint;

  @ApiPropertyOptional()
  pageCount?: number;

  @ApiPropertyOptional()
  coverUrl?: string;

  @ApiProperty()
  metadata: object;

  @ApiProperty()
  readCount: number;

  @ApiProperty()
  downloadCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  tags?: string[];
}

export class PaginatedBooksDto {
  @ApiProperty({ type: [BookResponseDto] })
  data: BookResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class UploadBookDto {
  @ApiPropertyOptional({ description: 'Auto-extract metadata from file' })
  @IsBoolean()
  @IsOptional()
  autoMetadata?: boolean;

  @ApiPropertyOptional({ description: 'Generate cover from file' })
  @IsBoolean()
  @IsOptional()
  generateCover?: boolean;
}

export class AddTagDto {
  @ApiProperty()
  @IsString()
  tagName: string;
}

export class BookStatsDto {
  @ApiProperty()
  totalBooks: number;

  @ApiProperty()
  totalFormats: Record<string, number>;

  @ApiProperty()
  totalSize: bigint;

  @ApiProperty()
  recentBooks: BookResponseDto[];
}
