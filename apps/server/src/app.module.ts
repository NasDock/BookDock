import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { BookMetadataModule } from './modules/book-metadata/book-metadata.module';
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

import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [AppConfig],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'web'),
      exclude: ['/api/(.*)', '/health', '/api/covers/(.*)'],
    }),
    DatabaseModule,
    AuthModule,
    BooksModule,
    BookMetadataModule,
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
