import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class SaveBookLastReadDto {
  @ApiProperty()
  @IsUUID()
  bookId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chapterIndex!: number;

  @ApiProperty({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paragraphIndex!: number;

  @ApiPropertyOptional({ default: 0, description: 'Offset within the current paragraph audio (ms)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  audioOffsetMs?: number;
}

export class BookLastReadResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  bookId!: string;

  @ApiProperty()
  chapterIndex!: number;

  @ApiProperty()
  paragraphIndex!: number;

  @ApiProperty()
  audioOffsetMs!: number;

  @ApiProperty()
  updatedAt!: Date;
}