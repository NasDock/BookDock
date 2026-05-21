import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { BooksController } from './books.controller';
import { BookMetadataModule } from '../book-metadata/book-metadata.module';
import { BooksService } from './books.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BookMetadataModule, // T7: import metadata module
    MulterModule.register({
      dest: './uploads',
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    }),
  ],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
// T7 completed
