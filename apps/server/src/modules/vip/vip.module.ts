import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { VipController } from './vip.controller';
import { VipService } from './vip.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [VipController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
