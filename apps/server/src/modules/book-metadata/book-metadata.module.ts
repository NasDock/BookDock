import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { DoubanScraperService } from './services/douban-scraper.service';
import { WikipediaService } from './services/wikipedia.service';
import { MetadataAggregatorService } from './services/metadata-aggregator.service';
import { CoverDownloaderService } from './services/cover-downloader.service';
import { BookMetadataService } from './book-metadata.service';
import { BookMetadataController } from './book-metadata.controller';

@Module({
  imports: [DatabaseModule],
  providers: [
    DoubanScraperService,
    WikipediaService,
    MetadataAggregatorService,
    CoverDownloaderService,
    BookMetadataService,
  ],
  controllers: [BookMetadataController],
  exports: [BookMetadataService],
})
export class BookMetadataModule {}

// T6 completed
