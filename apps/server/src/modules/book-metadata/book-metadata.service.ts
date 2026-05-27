import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import { MetadataAggregatorService } from './services/metadata-aggregator.service';
import { CoverDownloaderService } from './services/cover-downloader.service';
import { BookMetadataResponseDto } from './dto/book-metadata.dto';
import { BookResponseDto } from '../books/dto/books.dto';

@Injectable()
export class BookMetadataService {
  constructor(
    private readonly aggregator: MetadataAggregatorService,
    private readonly coverDownloader: CoverDownloaderService,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  /**
   * 通过书名获取元数据（不存数据库，纯查询）
   */
  async fetchByTitle(title: string): Promise<BookMetadataResponseDto> {
    if (!title || !title.trim()) {
      return { success: false, error: 'Title is required' };
    }

    const result = await this.aggregator.fetchMetadata(title.trim());
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  /**
   * 通过书名获取元数据，并下载封面，更新 book 表
   */
  async fetchAndUpdateBook(bookId: string): Promise<BookResponseDto> {
    // 1. 确认书籍存在
    const existingBook = await this.prisma.book.findUnique({
      where: { id: bookId, isDeleted: false },
      include: { bookTags: { include: { tag: true } } },
    });

    if (!existingBook) {
      throw new NotFoundException(`Book with id ${bookId} not found`);
    }

    // 2. 抓取元数据（使用书籍现有标题）
    const metadata = await this.aggregator.fetchMetadata(existingBook.title.trim());
    if (!metadata.success || !metadata.data) {
      return this.toBookResponse(existingBook);
    }

    const data = metadata.data;

    // 3. 下载封面（如果有 coverUrl）
    let coverUrl: string | undefined = existingBook.coverUrl || undefined;
    if (data.coverUrl) {
      const downloadResult = await this.coverDownloader.downloadCover(data.coverUrl, bookId);
      if (downloadResult) {
        coverUrl = downloadResult.localUrl;
      }
    }

    // 4. 组装 metadata JSON 字符串
    const metaJson = JSON.stringify({
      sources: data.sources,
      ...(data.rating !== undefined && { rating: data.rating }),
      ...(data.ratingCount !== undefined && { ratingCount: data.ratingCount }),
      ...(data.series !== undefined && { series: data.series }),
      ...(data.authorIntro !== undefined && { authorIntro: data.authorIntro }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.country !== undefined && { country: data.country }),
      ...(data.wikiUrl !== undefined && { wikiUrl: data.wikiUrl }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.tags !== undefined && { tags: data.tags }),
    });

    // 5. 同步 tags 到 Tag 表（如果豆瓣抓取了 tags）
    if (data.tags && data.tags.length > 0) {
      for (const tagName of data.tags) {
        const tag = await this.prisma.tag.upsert({
          where: { name: tagName },
          create: { name: tagName },
          update: {},
        });
        await this.prisma.bookTag.upsert({
          where: { bookId_tagId: { bookId, tagId: tag.id } },
          create: { bookId, tagId: tag.id },
          update: {},
        });
      }
    }

    // 6. 用 Prisma 更新 Book 表
    const updatedBook = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        author: data.authors?.length ? data.authors.join(', ') : existingBook.author,
        publisher: data.publisher ?? existingBook.publisher,
        publishedDate: data.publishedDate ? new Date(data.publishedDate) : existingBook.publishedDate,
        isbn: data.isbn ?? existingBook.isbn,
        pageCount: data.pageCount ?? existingBook.pageCount,
        coverUrl: coverUrl ?? existingBook.coverUrl,
        description: data.summary ?? existingBook.description,
        metadata: metaJson,
      },
      include: { bookTags: { include: { tag: true } } },
    });

    return this.toBookResponse(updatedBook);
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
    };
  }
}

// T6 completed
