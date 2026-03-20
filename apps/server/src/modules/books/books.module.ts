import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { DatabaseModule } from '../../config/database.module';

@Module({
  imports: [
    DatabaseModule,
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
