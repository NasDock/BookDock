import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TtsVoiceGender } from '@prisma/client';

export class CreateTtsJobDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  bookId?: string;

  @ApiPropertyOptional({ description: 'EPUB CFI range start' })
  @IsString()
  @IsOptional()
  startCfi?: string;

  @ApiPropertyOptional({ description: 'EPUB CFI range end' })
  @IsString()
  @IsOptional()
  endCfi?: string;

  @ApiPropertyOptional({ default: 'en_US-lessac-medium' })
  @IsString()
  @IsOptional()
  voice?: string;

  @ApiPropertyOptional({ enum: TtsVoiceGender })
  @IsEnum(TtsVoiceGender)
  @IsOptional()
  gender?: TtsVoiceGender;

  @ApiPropertyOptional({ default: 22050 })
  @Type(() => Number)
  @IsInt()
  @Min(8000)
  @Max(48000)
  @IsOptional()
  sampleRate?: number;
}

export class TtsJobQueryDto {
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
  bookId?: string;
}

export class TtsJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  bookId?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  voice: string;

  @ApiProperty()
  gender: string;

  @ApiProperty()
  sampleRate: number;

  @ApiPropertyOptional()
  startCfi?: string;

  @ApiPropertyOptional()
  endCfi?: string;

  @ApiPropertyOptional()
  outputPath?: string;

  @ApiPropertyOptional()
  outputUrl?: string;

  @ApiPropertyOptional()
  fileSize?: bigint;

  @ApiPropertyOptional()
  durationSecs?: number;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiProperty()
  retryCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  completedAt?: Date;
}

export class TtsVoiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  gender: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  sampleRate?: number;
}

export class TtsAudioFileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookId: string;

  @ApiPropertyOptional()
  fileUrl?: string;

  @ApiPropertyOptional()
  fileSize?: bigint;

  @ApiPropertyOptional()
  durationSecs?: number;

  @ApiProperty()
  voice: string;

  @ApiProperty()
  createdAt: Date;
}
