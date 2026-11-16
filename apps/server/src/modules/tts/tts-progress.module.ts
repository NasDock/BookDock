import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { TtsProgressController } from './tts-progress.controller';
import { TtsProgressService } from './tts-progress.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TtsProgressController],
  providers: [TtsProgressService],
  exports: [TtsProgressService],
})
export class TtsProgressModule {}
