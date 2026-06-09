import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { BookLastReadController } from './book-last-read.controller';
import { BookLastReadService } from './book-last-read.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [BookLastReadController],
  providers: [BookLastReadService],
  exports: [BookLastReadService],
})
export class BookLastReadModule {}