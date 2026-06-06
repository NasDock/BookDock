import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';

@Injectable()
export class AuthorService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async getAuthors(search?: string) {
    const where = search
      ? { name: { contains: search } }
      : {};
    const authors = await this.prisma.author.findMany({
      where,
      orderBy: { nameSort: 'asc' },
      include: {
        _count: { select: { books: true } },
      },
    });
    return authors.map((a) => ({
      id: a.id,
      name: a.name,
      nameSort: a.nameSort,
      bio: a.bio,
      avatarUrl: a.avatarUrl,
      birthDate: a.birthDate,
      deathDate: a.deathDate,
      nationality: a.nationality,
      source: a.source,
      bookCount: a._count.books,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
  }

  async getAuthor(id: string) {
    const author = await this.prisma.author.findUnique({
      where: { id },
      include: {
        _count: { select: { books: true } },
      },
    });
    if (!author) throw new NotFoundException('Author not found');
    return {
      id: author.id,
      name: author.name,
      nameSort: author.nameSort,
      bio: author.bio,
      avatarUrl: author.avatarUrl,
      birthDate: author.birthDate,
      deathDate: author.deathDate,
      nationality: author.nationality,
      source: author.source,
      bookCount: author._count.books,
      createdAt: author.createdAt,
      updatedAt: author.updatedAt,
    };
  }

  async getAuthorBooks(id: string) {
    const author = await this.prisma.author.findUnique({
      where: { id },
      include: {
        books: {
          orderBy: { sortOrder: 'asc' },
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
    if (!author) throw new NotFoundException('Author not found');

    // 通过 book_authors 关联获取的书籍
    const linkedBooks = author.books.map((ba) => ({
      ...ba.book,
      fileSize: ba.book.fileSize ? Number(ba.book.fileSize) : undefined,
    }));

    // 兜底：通过 book.author 字段匹配补充（兼容旧数据）
    const fallbackBooks = await this.prisma.book.findMany({
      where: {
        isDeleted: false,
        author: { contains: author.name },
        NOT: { id: { in: linkedBooks.map((b) => b.id) } },
      },
      select: {
        id: true,
        title: true,
        author: true,
        coverUrl: true,
        format: true,
        fileSize: true,
        readingProgress: true,
      },
    });

    return [
      ...linkedBooks,
      ...fallbackBooks.map((b) => ({
        ...b,
        fileSize: b.fileSize ? Number(b.fileSize) : undefined,
      })),
    ];
  }

  async createAuthor(dto: {
    name: string;
    nameSort?: string;
    bio?: string;
    avatarUrl?: string;
    birthDate?: string;
    deathDate?: string;
    nationality?: string;
    source?: string;
  }) {
    try {
      const author = await this.prisma.author.create({
        data: dto,
      });
      return author;
    } catch {
      throw new ConflictException('Author already exists');
    }
  }

  async updateAuthor(id: string, dto: {
    name?: string;
    nameSort?: string;
    bio?: string;
    avatarUrl?: string;
    birthDate?: string;
    deathDate?: string;
    nationality?: string;
    source?: string;
  }) {
    const author = await this.prisma.author.findUnique({ where: { id } });
    if (!author) throw new NotFoundException('Author not found');
    const updated = await this.prisma.author.update({
      where: { id },
      data: dto,
    });
    return updated;
  }

  async deleteAuthor(id: string) {
    const author = await this.prisma.author.findUnique({ where: { id } });
    if (!author) throw new NotFoundException('Author not found');
    await this.prisma.author.delete({ where: { id } });
    return { message: 'Author deleted' };
  }

  /**
   * 根据作者名查找或创建作者
   */
  async findOrCreateByName(name: string, extra?: {
    bio?: string;
    avatarUrl?: string;
    source?: string;
  }) {
    const existing = await this.prisma.author.findUnique({
      where: { name },
    });
    if (existing) return existing;

    return this.prisma.author.create({
      data: {
        name,
        ...extra,
      },
    });
  }

  /**
   * 为书籍设置作者关联
   */
  async setBookAuthors(bookId: string, authorNames: string[]) {
    // 先删除现有关联
    await this.prisma.bookAuthor.deleteMany({
      where: { bookId },
    });

    // 创建新关联
    for (let i = 0; i < authorNames.length; i++) {
      const name = authorNames[i].trim();
      if (!name) continue;

      const author = await this.findOrCreateByName(name);
      await this.prisma.bookAuthor.create({
        data: {
          bookId,
          authorId: author.id,
          sortOrder: i,
        },
      });
    }
  }
}
