import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('app.redisUrl'),
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
      inject: [ConfigService],
    }),
    // Register queues
    BullModule.registerQueue(
      { name: 'book-index' },
      { name: 'tts-synthesize' },
      { name: 'data-sync' },
    ),
  ],
  exports: [BullModule],
})
export class BullMQModule {}
