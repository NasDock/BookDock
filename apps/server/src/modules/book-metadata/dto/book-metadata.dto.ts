import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AggregatedBookMetadata } from '../services/metadata-aggregator.service';

export class FetchMetadataDto {
  @ApiProperty({ example: '三体', description: 'Book title to search for metadata' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: '9787536692930', description: 'Optional ISBN for more accurate matching' })
  @IsString()
  @IsOptional()
  isbn?: string;
}

export class FetchMetadataByBookIdDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Book ID to update' })
  @IsUUID()
  bookId: string;
}

export class BookMetadataResponseDto {
  @ApiProperty({ description: 'Whether the metadata fetch was successful' })
  @IsBoolean()
  success: boolean;

  @ApiPropertyOptional({ description: 'Aggregated metadata from multiple sources' })
  data?: AggregatedBookMetadata['data'];

  @ApiPropertyOptional({ description: 'Error message if fetch failed' })
  @IsString()
  @IsOptional()
  error?: string;
}

// T6 completed
