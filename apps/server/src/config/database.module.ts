import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const PRISMA_CLIENT = 'PRISMA_CLIENT';

export const DatabaseProvider = {
  provide: PRISMA_CLIENT,
  useFactory: async () => {
    const prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
    await prisma.$connect();
    return prisma;
  },
};

@Module({
  providers: [DatabaseProvider],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule {}
