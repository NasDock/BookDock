import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { MembershipModule } from '../membership/membership.module';
import { TtsQuotaGuard } from './tts-quota.guard';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
  imports: [DatabaseModule, AuthModule, MembershipModule],
  controllers: [TtsController],
  providers: [TtsService, TtsQuotaGuard],
  exports: [TtsService],
})
export class TtsModule {}
