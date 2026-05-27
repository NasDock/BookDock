import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CollectionController],
  providers: [CollectionService],
})
export class CollectionModule {}
