import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Max,
    Min,
} from 'class-validator';
import { TtsVoiceGender } from '../../../common/types/prisma-compat';

export class CreateTtsJobDto {
  @ApiPropertyOptional({ description: 'Text content to synthesize' })
  @IsString()
  @IsOptional()
  text?: string;

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

// ─────────────────────────────────────────────────────────────────────────────
// Paragraph-level synthesize (new TTS gateway path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request body for POST /tts/synthesize (paragraph-level).
 * Replaces the old text-only endpoint. Returns a URL pointing to a
 * cached mp3 file under /audio/<hash>.mp3, which the client plays
 * via <audio src="...">.
 */
export class SynthesizeParagraphDto {
  @ApiPropertyOptional({ description: 'Book UUID (used for cache & quota tracking)' })
  @IsUUID()
  @IsOptional()
  bookId?: string;

  @ApiPropertyOptional({ description: 'Stable paragraph id within the chapter' })
  @IsString()
  @IsOptional()
  paragraphId?: string;

  @ApiProperty({ description: 'Text to synthesize (≤ 3000 chars)' })
  @IsString()
  @Length(1, 3000)
  text!: string;

  @ApiPropertyOptional({ description: 'Provider name (default: app.ttsDefaultProvider)' })
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ description: 'Voice id (provider-specific)' })
  @IsString()
  @IsOptional()
  voice?: string;

  @ApiPropertyOptional({ default: 1.0, minimum: 0.25, maximum: 4.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.25)
  @Max(4.0)
  @IsOptional()
  rate?: number;

  @ApiPropertyOptional({ default: 1.0, minimum: 0.0, maximum: 2.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  pitch?: number;

  @ApiPropertyOptional({ default: 1.0, minimum: 0.0, maximum: 2.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  volume?: number;
}

export class SynthesizeParagraphResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty()
  contentHash!: string;

  @ApiProperty()
  provider!: string;

  @ApiProperty()
  voice!: string;

  @ApiProperty()
  bytes!: number;

  @ApiProperty({ description: 'true if served from cache' })
  cached!: boolean;
}
