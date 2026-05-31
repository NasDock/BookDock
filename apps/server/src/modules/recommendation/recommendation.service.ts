import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import { BookResponseDto } from '../books/dto/books.dto';

export interface RecommendBookResult {
  books: BookResponseDto[];
}

@Injectable()
export class RecommendationService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  /**
   * 基于用户阅读历史生成推荐书籍列表
   *
   * 算法逻辑：
   * 1. 获取用户的阅读历史（ReadingProgress）和收藏（Favorite）
   * 2. 提取用户偏好的作者、标签
   * 3. 为每本候选书籍计算推荐分数
   * 4. 排除用户正在读和最近读过的书
   * 5. 返回排序后的推荐列表
   */
  async getRecommendations(userId: string, limit = 12): Promise<RecommendBookResult> {
    // 1. 获取用户阅读历史和收藏
    const [readingProgresses, favorites] = await Promise.all([
      this.prisma.readingProgress.findMany({
        where: { userId },
        include: {
          book: {
            include: { bookTags: { include: { tag: true } } },
          },
        },
      }),
      this.prisma.favorite.findMany({
        where: { userId },
        include: {
          book: {
            include: { bookTags: { include: { tag: true } } },
          },
        },
      }),
    ]);

    // 2. 提取用户偏好的作者和标签
    const preferredAuthors = new Map<string, number>();
    const preferredTags = new Map<string, number>();
    const interactedBookIds = new Set<string>();

    for (const rp of readingProgresses) {
      interactedBookIds.add(rp.bookId);
      if (rp.book.author) {
        preferredAuthors.set(
          rp.book.author,
          (preferredAuthors.get(rp.book.author) || 0) + rp.progressPct / 100,
        );
      }
      for (const bt of rp.book.bookTags || []) {
        preferredTags.set(
          bt.tag.name,
          (preferredTags.get(bt.tag.name) || 0) + rp.progressPct / 100,
        );
      }
    }

    for (const fav of favorites) {
      interactedBookIds.add(fav.bookId);
      if (fav.book.author) {
        preferredAuthors.set(
          fav.book.author,
          (preferredAuthors.get(fav.book.author) || 0) + 1,
        );
      }
      for (const bt of fav.book.bookTags || []) {
        preferredTags.set(
          bt.tag.name,
          (preferredTags.get(bt.tag.name) || 0) + 1,
        );
      }
    }

    // 3. 获取候选书籍（排除已交互的）
    const candidateBooks = await this.prisma.book.findMany({
      where: {
        isDeleted: false,
        id: { notIn: Array.from(interactedBookIds) },
      },
      include: {
        bookTags: { include: { tag: true } },
      },
      take: 200, // 取足够多的候选
    });

    if (candidateBooks.length === 0) {
      // 如果没有候选（用户读了所有书），返回最近添加的高评分书
      const fallback = await this.prisma.book.findMany({
        where: { isDeleted: false },
        orderBy: { readCount: 'desc' },
        include: { bookTags: { include: { tag: true } } },
        take: limit,
      });
      return { books: fallback.map((b) => this.toBookResponse(b)) };
    }

    // 4. 计算每本书的推荐分数
    const scoredBooks = candidateBooks.map((book) => {
      let score = 0;

      // 同作者加分
      if (book.author && preferredAuthors.has(book.author)) {
        score += 50 * (preferredAuthors.get(book.author) || 1);
      }

      // 同标签加分
      for (const bt of book.bookTags || []) {
        if (preferredTags.has(bt.tag.name)) {
          score += 20 * (preferredTags.get(bt.tag.name) || 1);
        }
      }

      // 高评分加分（从 metadata 解析）
      try {
        const metadata = JSON.parse(book.metadata || '{}');
        if (metadata.rating && metadata.rating > 8.0) {
          score += 30;
        }
        if (metadata.ratingCount && metadata.ratingCount > 1000) {
          score += 10;
        }
      } catch {
        // ignore metadata parse errors
      }

      // 热门加分
      if (book.readCount > 10) {
        score += 15;
      }
      if (book.downloadCount > 5) {
        score += 10;
      }

      // 随机扰动（避免每次结果完全一致）
      score += Math.random() * 10 - 5;

      return { book, score };
    });

    // 5. 按分数降序排序，取前 limit
    scoredBooks.sort((a, b) => b.score - a.score);
    const recommended = scoredBooks.slice(0, limit).map((s) => s.book);

    return {
      books: recommended.map((b) => this.toBookResponse(b)),
    };
  }

  private toBookResponse(book: any): BookResponseDto {
    return {
      id: book.id,
      title: book.title,
      author: book.author || undefined,
      description: book.description || undefined,
      isbn: book.isbn || undefined,
      publisher: book.publisher || undefined,
      publishedDate: book.publishedDate || undefined,
      language: book.language,
      format: book.format,
      filePath: book.filePath,
      fileHash: book.fileHash || undefined,
      fileSize: book.fileSize ? Number(book.fileSize) : undefined,
      pageCount: book.pageCount || undefined,
      coverUrl: book.coverUrl || undefined,
      metadata: book.metadata || {},
      readCount: book.readCount,
      downloadCount: book.downloadCount,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      tags: book.bookTags?.map((bt: any) => bt.tag.name) || [],
    } as any;
  }
}
