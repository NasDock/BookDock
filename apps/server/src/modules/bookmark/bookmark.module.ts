import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { BookmarkController } from './bookmark.controller';
import { BookmarkService } from './bookmark.service';

@Module({
  imports: [DatabaseModule],
  controllers: [BookmarkController],
  providers: [BookmarkService],
  exports: [BookmarkService],
})
export class BookmarkModule {}
