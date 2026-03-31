import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateBookmarkDto {
  @ApiProperty()
  @IsUUID()
  bookId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  chapterId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cfi?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  percentage?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateBookmarkDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;
}

export class BookmarkResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  bookId!: string;

  @ApiPropertyOptional()
  chapterId?: string;

  @ApiPropertyOptional()
  cfi?: string;

  @ApiPropertyOptional()
  percentage?: number;

  @ApiPropertyOptional()
  note?: string;

  @ApiPropertyOptional()
  color?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class CreateHighlightDto {
  @ApiProperty()
  @IsUUID()
  bookId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  chapterId?: string;

  @ApiProperty()
  @IsString()
  cfi!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  startOffset!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  endOffset!: number;

  @ApiProperty()
  @IsString()
  text!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateHighlightDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;
}

export class HighlightResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  bookId!: string;

  @ApiPropertyOptional()
  chapterId?: string;

  @ApiProperty()
  cfi!: string;

  @ApiProperty()
  startOffset!: number;

  @ApiProperty()
  endOffset!: number;

  @ApiProperty()
  text!: string;

  @ApiPropertyOptional()
  color?: string;

  @ApiPropertyOptional()
  note?: string;

  @ApiProperty()
  createdAt!: Date;
}

export class BookmarkQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number = 50;
}

export class HighlightQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number = 50;
}
