import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './config/app.config';
import { DatabaseModule } from './config/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookmarkModule } from './modules/bookmark/bookmark.module';
import { BooksModule } from './modules/books/books.module';
import { MembershipModule } from './modules/membership/membership.module';
import { VipModule } from './modules/vip/vip.module';
import { ReadingProgressModule } from './modules/reading-progress/reading-progress.module';
import { TtsModule } from './modules/tts/tts.module';
import { SourceModule } from './modules/source/source.module';
import { BullMQModule } from './queues/bullmq.module';

import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [AppConfig],
    }),
    DatabaseModule,
    BullMQModule,
    AuthModule,
    BooksModule,
    ReadingProgressModule,
    TtsModule,
    AdminModule,
    MembershipModule,
    VipModule,
    SourceModule,
    BookmarkModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
