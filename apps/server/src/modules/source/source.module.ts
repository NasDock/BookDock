import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../config/database.module';
import { AuthModule } from '../auth/auth.module';
import { SourceController } from './source.controller';
import { SourceService } from './source.service';

@Module({
    imports: [
        DatabaseModule,
        AuthModule,
        ConfigModule,
    ],
    controllers: [SourceController],
    providers: [SourceService],
    exports: [SourceService],
})
export class SourceModule {}
