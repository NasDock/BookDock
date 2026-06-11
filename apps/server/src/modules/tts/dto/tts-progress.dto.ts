import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SaveTtsProgressDto {
  @ApiProperty()
  @IsUUID()
  bookId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chapterIndex!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paragraphIndex!: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  charOffset?: number;

  @ApiPropertyOptional({ default: 0, description: 'Offset within the current paragraph audio (ms)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  audioOffsetMs?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  voice?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  totalParagraphs?: number;
}

export class TtsProgressResponseDto {
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
  charOffset!: number;

  @ApiProperty()
  audioOffsetMs!: number;

  @ApiPropertyOptional()
  voice?: string;

  @ApiPropertyOptional()
  provider?: string;

  @ApiProperty()
  totalParagraphs!: number;

  @ApiProperty()
  updatedAt!: Date;
}
