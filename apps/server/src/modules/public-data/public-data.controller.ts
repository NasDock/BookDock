import { Controller, Get, Query } from '@nestjs/common';
import { PublicDataService } from './public-data.service';

@Controller('public-data')
export class PublicDataController {
  constructor(private readonly publicDataService: PublicDataService) {}

  @Get('search')
  async searchBooks(@Query('q') query: string) {
    return this.publicDataService.searchBooks(query);
  }

  @Get('book')
  async getBookMetadata(@Query('isbn') isbn?: string, @Query('title') title?: string) {
    return this.publicDataService.getBookMetadata(isbn, title);
  }
}
