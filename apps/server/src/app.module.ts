import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from './config/app.config';
import { DatabaseModule } from './config/database.module';
import { BullMQModule } from './queues/bullmq.module';
import { AuthModule } from './modules/auth/auth.module';
import { BooksModule } from './modules/books/books.module';
import { ReadingProgressModule } from './modules/reading-progress/reading-progress.module';
import { TtsModule } from './modules/tts/tts.module';
import { AdminModule } from './modules/admin/admin.module';
import { MembershipModule } from './modules/membership/membership.module';
import { PublicDataModule } from './modules/public-data/public-data.module';
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
    PublicDataModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
