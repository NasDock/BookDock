import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';

@Injectable()
export class FavoriteService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async getFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            coverUrl: true,
            format: true,
            fileSize: true,
            readingProgress: true,
          },
        },
      },
    });
    return favorites.map((f) => f.book);
  }

  async checkFavorite(userId: string, bookId: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    return { isFavorite: !!favorite };
  }

  async addFavorite(userId: string, bookId: string) {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    try {
      await this.prisma.favorite.create({
        data: { userId, bookId },
      });
    } catch {
      throw new ConflictException('Book already in favorites');
    }
    return { message: 'Added to favorites' };
  }

  async removeFavorite(userId: string, bookId: string) {
    await this.prisma.favorite.delete({
      where: { userId_bookId: { userId, bookId } },
    });
    return { message: 'Removed from favorites' };
  }
}
