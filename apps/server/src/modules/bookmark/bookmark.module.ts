import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { BookmarkController } from './bookmark.controller';
import { BookmarkService } from './bookmark.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [BookmarkController],
  providers: [BookmarkService],
  exports: [BookmarkService],
})
export class BookmarkModule {}
