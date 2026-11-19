import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
