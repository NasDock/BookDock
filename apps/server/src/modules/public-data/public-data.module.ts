import { Module } from '@nestjs/common';
import { PublicDataController } from './public-data.controller';
import { PublicDataService } from './public-data.service';

@Module({
  controllers: [PublicDataController],
  providers: [PublicDataService],
})
export class PublicDataModule {}
