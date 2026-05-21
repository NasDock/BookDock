import { Injectable, Logger } from '@nestjs/common';
import { DoubanScraperService, DoubanBookInfo } from './douban-scraper.service';
import { WikipediaService, WikipediaBookInfo } from './wikipedia.service';

export interface AggregatedBookMetadata {
  success: boolean;
  data?: {
    title: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    summary?: string;
    coverUrl?: string;
    rating?: number;
    series?: string;
    authorIntro?: string;
    sources: string[]; // ["douban", "wikipedia"] 等
    category?: string[];
    country?: string;
    language?: string;
    wikiUrl?: string;
    isbn?: string;
    pageCount?: number;
    price?: string;
    ratingCount?: number;
    tags?: string[];
  };
  error?: string;
}

const FIELD_PRIORITY: Record<string, string[]> = {
  title: ['douban', 'wikipedia'],
  authors: ['douban', 'wikipedia'],
  publisher: ['douban', 'wikipedia'],
  publishedDate: ['douban', 'wikipedia'],
  isbn: ['douban'],
  rating: ['douban'],
  pageCount: ['douban', 'wikipedia'],
  coverUrl: ['douban', 'wikipedia'],
  summary: ['wikipedia', 'douban'],
  authorIntro: ['douban'],
  series: ['douban'],
  category: ['wikipedia'],
  country: ['wikipedia'],
  language: ['wikipedia'],
  tags: ['douban'],
  wikiUrl: ['wikipedia'],
  price: ['douban'],
  ratingCount: ['douban'],
};

interface SourceData {
  name: string;
  info: DoubanBookInfo | WikipediaBookInfo;
}

@Injectable()
export class MetadataAggregatorService {
  private readonly logger = new Logger(MetadataAggregatorService.name);

  constructor(
    private readonly doubanScraper: DoubanScraperService,
    private readonly wikipediaService: WikipediaService,
  ) {}

  async fetchMetadata(title: string): Promise<AggregatedBookMetadata> {
    if (!title || !title.trim()) {
      return { success: false, error: 'Title is required' };
    }

    let doubanResult: DoubanBookInfo | null = null;
    let wikipediaResult: WikipediaBookInfo | null = null;

    try {
      // 同时发起两个查询
      [doubanResult, wikipediaResult] = await Promise.all([
        this.doubanScraper.fetchByTitle(title).catch((err) => {
          this.logger.warn(`Douban fetch failed for "${title}": ${err.message}`);
          return null;
        }),
        this.wikipediaService.searchBook(title).catch((err) => {
          this.logger.warn(`Wikipedia fetch failed for "${title}": ${err.message}`);
          return null;
        }),
      ]);
    } catch (err) {
      this.logger.error(`Aggregate fetch failed for "${title}": ${err.message}`);
      return { success: false, error: `Fetch failed: ${err.message}` };
    }

    // 收集成功返回的数据源
    const sources: SourceData[] = [];
    if (doubanResult) {
      sources.push({ name: 'douban', info: doubanResult });
    }
    if (wikipediaResult) {
      sources.push({ name: 'wikipedia', info: wikipediaResult });
    }

    if (sources.length === 0) {
      return { success: false, error: `No metadata found for "${title}"` };
    }

    // 以第一个成功的数据源为基础初始化
    const base = sources[0].info;
    const result: AggregatedBookMetadata['data'] = {
      title: base.title,
      sources: sources.map((s) => s.name),
    };

    // 先填充基础字段
    this.fillFromSource(result, base);

    // 按优先级遍历字段，用更高优先级的源覆盖空字段
    for (const [field, priorityList] of Object.entries(FIELD_PRIORITY)) {
      // 跳过 title 和 sources（已处理）
      if (field === 'title' || field === 'sources') continue;

      for (const sourceName of priorityList) {
        const source = sources.find((s) => s.name === sourceName);
        if (!source) continue;

        const value = this.extractField(source.info, field);
        if (value !== undefined && value !== null && value !== '') {
          const current = result[field as keyof typeof result];
          // 只有当当前字段为空时才覆盖
          if (
            current === undefined ||
            current === null ||
            current === '' ||
            (Array.isArray(current) && current.length === 0)
          ) {
            (result as any)[field] = value;
          }
        }
      }
    }

    return { success: true, data: result };
  }

  /**
   * 从一个源的数据填充聚合结果的所有字段
   */
  private fillFromSource(
    target: NonNullable<AggregatedBookMetadata['data']>,
    source: DoubanBookInfo | WikipediaBookInfo,
  ): void {
    const fields = Object.keys(FIELD_PRIORITY) as string[];
    for (const field of fields) {
      if (field === 'title' || field === 'sources') continue;
      const value = this.extractField(source, field);
      if (value !== undefined && value !== null && value !== '') {
        (target as any)[field] = value;
      }
    }
  }

  /**
   * 从源数据中提取指定字段值，处理字段名映射
   */
  private extractField(
    source: DoubanBookInfo | WikipediaBookInfo,
    field: string,
  ): any {
    const s = source as any;

    switch (field) {
      case 'publishedDate':
        return s.publishedDate ?? s.publishedYear ?? undefined;
      case 'pageCount':
        return s.pages ?? s.pageCount ?? undefined;
      case 'authors':
        return s.authors ?? undefined;
      case 'publisher':
        return s.publisher ?? undefined;
      case 'isbn':
        return s.isbn ?? undefined;
      case 'rating':
        return s.rating ?? undefined;
      case 'coverUrl':
        return s.coverUrl ?? undefined;
      case 'summary':
        return s.summary ?? undefined;
      case 'authorIntro':
        return s.authorIntro ?? undefined;
      case 'series':
        return s.series ?? undefined;
      case 'category':
        return s.category ?? undefined;
      case 'country':
        return s.country ?? undefined;
      case 'language':
        return s.language ?? undefined;
      case 'tags':
        return s.tags ?? undefined;
      case 'wikiUrl':
        return s.wikiUrl ?? undefined;
      case 'price':
        return s.price ?? undefined;
      case 'ratingCount':
        return s.ratingCount ?? undefined;
      default:
        return s[field] ?? undefined;
    }
  }
}

// T4 completed
