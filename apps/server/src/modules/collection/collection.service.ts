import { Injectable, Inject, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';

@Injectable()
export class CollectionService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async getCollections(userId: string) {
    const collections = await this.prisma.collection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { items: true } },
      },
    });
    return collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      coverUrl: c.coverUrl,
      bookCount: c._count.items,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getCollection(userId: string, id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { addedAt: 'desc' },
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
        },
      },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId) throw new ForbiddenException('Access denied');
    const books = (collection as any).items.map((item: any) => ({
      ...item.book,
      fileSize: item.book.fileSize ? Number(item.book.fileSize) : undefined,
      readingProgress: item.book.readingProgress?.map((rp: any) => ({
        ...rp,
        timeSpentSecs: rp.timeSpentSecs ? Number(rp.timeSpentSecs) : undefined,
      })),
    }));
    return {
      id: collection.id,
      userId: collection.userId,
      name: collection.name,
      description: collection.description,
      coverUrl: collection.coverUrl,
      isPublic: collection.isPublic,
      sortOrder: collection.sortOrder,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
      books,
    };
  }

  async createCollection(userId: string, dto: { name: string; description?: string }) {
    const collection = await this.prisma.collection.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
      },
    });
    return collection;
  }

  async updateCollection(userId: string, id: string, dto: { name?: string; description?: string }) {
    const collection = await this.prisma.collection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId) throw new ForbiddenException('Access denied');
    const updated = await this.prisma.collection.update({
      where: { id },
      data: dto,
    });
    return updated;
  }

  async deleteCollection(userId: string, id: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId) throw new ForbiddenException('Access denied');
    await this.prisma.collection.delete({ where: { id } });
    return { message: 'Collection deleted' };
  }

  async addBook(userId: string, collectionId: string, bookId: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId) throw new ForbiddenException('Access denied');
    const existing = await this.prisma.collectionItem.findUnique({
      where: { collectionId_bookId: { collectionId, bookId } },
    });
    if (existing) throw new ConflictException('Book already in collection');
    await this.prisma.collectionItem.create({
      data: { collectionId, bookId },
    });
    return { message: 'Book added to collection' };
  }

  async removeBook(userId: string, collectionId: string, bookId: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId) throw new ForbiddenException('Access denied');
    await this.prisma.collectionItem.delete({
      where: { collectionId_bookId: { collectionId, bookId } },
    });
    return { message: 'Book removed from collection' };
  }
}
