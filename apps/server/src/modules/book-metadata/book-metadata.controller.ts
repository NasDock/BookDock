import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BookMetadataService } from './book-metadata.service';
import {
  FetchMetadataDto,
  FetchMetadataByBookIdDto,
  BookMetadataResponseDto,
} from './dto/book-metadata.dto';
import { BookResponseDto } from '../books/dto/books.dto';

@ApiBearerAuth()
@ApiTags('Book Metadata')
@Controller('book-metadata')
export class BookMetadataController {
  constructor(private readonly bookMetadataService: BookMetadataService) {}

  @Post('fetch')
  @ApiOperation({ summary: 'Fetch metadata by book title' })
  @ApiResponse({ status: 200, type: BookMetadataResponseDto })
  async fetchByTitle(@Body() dto: FetchMetadataDto): Promise<BookMetadataResponseDto> {
    return this.bookMetadataService.fetchByTitle(dto.title);
  }

  @Post('fetch-by-book-id')
  @ApiOperation({ summary: 'Fetch metadata and update book record' })
  @ApiResponse({ status: 200, type: BookResponseDto })
  async fetchByBookId(@Body() dto: FetchMetadataByBookIdDto): Promise<BookResponseDto> {
    return this.bookMetadataService.fetchAndUpdateBook(dto.bookId);
  }
}

// T8 completed
// T6 completed
