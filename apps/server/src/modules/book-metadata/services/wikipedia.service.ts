import { Injectable, Logger } from '@nestjs/common';
import wiki from 'wikipedia';

export interface WikipediaBookInfo {
  title: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  summary?: string;
  coverUrl?: string;
  category?: string[];
  country?: string;
  language?: string;
  wikiUrl?: string;
  pages?: number;
  isbn?: string;
}

function extractFromInfobox(infobox: Record<string, any>, keys: string[]): any {
  if (!infobox || typeof infobox !== 'object') {
    return undefined;
  }
  for (const key of keys) {
    if (key in infobox && infobox[key] !== undefined && infobox[key] !== null && infobox[key] !== '') {
      return infobox[key];
    }
  }
  return undefined;
}

function toStringArray(value: any): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  const str = String(value).trim();
  if (!str) {
    return undefined;
  }
  return str.split(/[,;、，]/).map((s) => s.trim()).filter(Boolean);
}

function toNumber(value: any): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const num = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : undefined;
}

@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);

  constructor() {
    wiki.setLang('zh');
  }

  async searchBook(title: string): Promise<WikipediaBookInfo | null> {
    if (!title || !title.trim()) {
      return null;
    }

    let page: any;

    // 1. 直接尝试获取页面
    try {
      page = await wiki.page(title.trim());
    } catch (directErr) {
      this.logger.debug(`Direct wiki.page failed for "${title}": ${directErr.message}`);
    }

    // 2. 直接获取失败，尝试搜索
    if (!page) {
      try {
        const searchResult = await wiki.search(title.trim(), { limit: 3 });
        const results = searchResult?.results ?? [];
        if (results.length > 0 && results[0]?.title) {
          page = await wiki.page(results[0].title);
        }
      } catch (searchErr) {
        this.logger.debug(`Wiki search failed for "${title}": ${searchErr.message}`);
      }
    }

    if (!page) {
      return null;
    }

    try {
      const summary = await page.summary();
      const infobox = await page.infobox();

      const authors = toStringArray(
        extractFromInfobox(infobox, ['author', '作者', 'authors']),
      );
      const publisher = extractFromInfobox(infobox, [
        'publisher',
        '出版社',
      ]);
      const pubDate = extractFromInfobox(infobox, [
        'published',
        'pubDate',
        '出版日期',
        '出版',
        'releaseDate',
        '発売日',
      ]);
      const country = extractFromInfobox(infobox, ['country', '国家']);
      const language = extractFromInfobox(infobox, ['language', '语言']);
      const pages = toNumber(
        extractFromInfobox(infobox, ['pages', '页数', 'pages_count']),
      );
      const isbn = extractFromInfobox(infobox, ['isbn', 'ISBN']);

      const info: WikipediaBookInfo = {
        title: summary.title ?? page.title ?? title,
        authors,
        publisher,
        publishedDate: pubDate,
        summary: summary.extract,
        coverUrl: summary.thumbnail?.source,
        country,
        language,
        wikiUrl: summary.content_urls?.desktop?.page ?? page.fullurl,
        pages,
        isbn,
      };

      return info;
    } catch (extractErr) {
      this.logger.warn(`Failed to extract info from wiki page for "${title}": ${extractErr.message}`);
      return null;
    }
  }
}

// T3 completed
