import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [FavoriteController],
  providers: [FavoriteService],
})
export class FavoriteModule {}
