import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

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

interface WikiSearchPage {
  pageid: number;
  title: string;
}

interface WikiPageDetail {
  pageid?: number;
  title?: string;
  extract?: string;
  fullurl?: string;
  thumbnail?: { source?: string };
  pageprops?: { wikibase_item?: string };
  revisions?: Array<{
    slots?: {
      main?: {
        content?: string;
        '*': string;
      };
    };
  }>;
}

interface WikiPageResponse {
  query?: {
    search?: WikiSearchPage[];
    pages?: Record<string, WikiPageDetail>;
  };
}

function toStringArray(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\[\[[^\]|]+\|([^\]]+)]]/g, '$1').replace(/\[\[|]]/g, '');
  return cleaned
    .split(/[,;、，]/)
    .map((s) => s.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : undefined;
}

@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);
  private readonly http: AxiosInstance;
  private readonly apiUrl: string;
  private lastRequestTime = 0;
  private warnedUnavailable = false;

  constructor() {
    const apiBase = process.env.WIKIPEDIA_API_BASE_URL || 'https://zh.wikipedia.org/w/api.php';
    this.apiUrl = apiBase;
    this.http = axios.create({
      timeout: Number(process.env.WIKIPEDIA_TIMEOUT_MS || 12000),
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'User-Agent':
          process.env.METADATA_USER_AGENT ||
          'BookDock/0.0.38 (local metadata lookup; contact: local-dev)',
      },
    });
  }

  async searchBook(title: string): Promise<WikipediaBookInfo | null> {
    if (!title || !title.trim()) {
      return null;
    }

    try {
      const page = await this.findPage(title.trim());
      if (!page) {
        return null;
      }

      const detail = await this.fetchPageDetail(page.pageid);
      if (!detail) {
        return null;
      }

      const source = this.getRevisionContent(detail);
      const infobox = source ? this.extractInfoboxFields(source) : new Map<string, string>();

      return {
        title: detail.title || page.title || title,
        authors: toStringArray(this.getInfoboxValue(infobox, ['author', '作者'])),
        publisher: this.getInfoboxValue(infobox, ['publisher', '出版社']),
        publishedDate: this.getInfoboxValue(infobox, ['published', 'pub_date', '出版日期', '出版']),
        summary: detail.extract,
        coverUrl: detail.thumbnail?.source,
        country: this.getInfoboxValue(infobox, ['country', '国家']),
        language: this.getInfoboxValue(infobox, ['language', '语言']),
        wikiUrl: detail.fullurl,
        pages: toNumber(this.getInfoboxValue(infobox, ['pages', '页数'])),
        isbn: this.getInfoboxValue(infobox, ['isbn', 'ISBN']),
      };
    } catch (err) {
      this.logRequestError(title, err);
      return null;
    }
  }

  private async findPage(title: string): Promise<WikiSearchPage | null> {
    await this.throttle();

    const direct = await this.http.get<WikiPageResponse>(this.apiUrl, {
      params: {
        action: 'query',
        format: 'json',
        redirects: 1,
        titles: title,
      },
    });

    const directPage = Object.values(direct.data.query?.pages || {}).find((page) => page.pageid);
    if (directPage?.pageid && directPage.title) {
      return { pageid: directPage.pageid, title: directPage.title };
    }

    await this.throttle();
    const search = await this.http.get<WikiPageResponse>(this.apiUrl, {
      params: {
        action: 'query',
        format: 'json',
        list: 'search',
        srsearch: title,
        srlimit: 3,
      },
    });

    const first = search.data.query?.search?.[0];
    return first?.pageid && first.title ? first : null;
  }

  private async fetchPageDetail(pageId: number): Promise<WikiPageDetail | null> {
    await this.throttle();

    const response = await this.http.get<WikiPageResponse>(this.apiUrl, {
      params: {
        action: 'query',
        format: 'json',
        pageids: pageId,
        prop: 'extracts|pageimages|info|revisions',
        exintro: 1,
        explaintext: 1,
        piprop: 'thumbnail',
        pithumbsize: 600,
        inprop: 'url',
        rvprop: 'content',
        rvslots: 'main',
      },
    });

    return Object.values(response.data.query?.pages || {})[0] || null;
  }

  private getRevisionContent(page: WikiPageDetail): string | undefined {
    const main = page.revisions?.[0]?.slots?.main;
    return main?.content || main?.['*'];
  }

  private extractInfoboxFields(source: string): Map<string, string> {
    const result = new Map<string, string>();
    const infoboxStart = source.search(/\{\{\s*(Infobox|信息框|圖書資訊|图书信息)/i);
    if (infoboxStart < 0) {
      return result;
    }

    let depth = 0;
    let end = infoboxStart;
    for (let i = infoboxStart; i < source.length - 1; i++) {
      const pair = source.slice(i, i + 2);
      if (pair === '{{') {
        depth++;
        i++;
        continue;
      }
      if (pair === '}}') {
        depth--;
        i++;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    const box = source.slice(infoboxStart, end);
    for (const line of box.split('\n')) {
      const match = line.match(/^\s*\|\s*([^=]+?)\s*=\s*(.+)\s*$/);
      if (!match) continue;

      result.set(match[1].trim(), this.cleanWikiText(match[2]));
    }

    return result;
  }

  private getInfoboxValue(fields: Map<string, string>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = fields.get(key);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private cleanWikiText(value: string): string {
    return value
      .replace(/<!--.*?-->/g, '')
      .replace(/<ref[^>]*>.*?<\/ref>/g, '')
      .replace(/<ref[^/]*\/>/g, '')
      .replace(/\{\{[^{}]*}}/g, '')
      .replace(/\[\[([^|\]]+)\|([^\]]+)]]/g, '$2')
      .replace(/\[\[|]]/g, '')
      .replace(/'''?/g, '')
      .trim();
  }

  private logRequestError(title: string, err: unknown): void {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const reason = status ? `HTTP ${status}` : err.code || err.message;
      if (!this.warnedUnavailable) {
        this.logger.warn(
          `Wikipedia metadata requests are unavailable: ${reason}. Set WIKIPEDIA_API_BASE_URL or HTTPS_PROXY if your network cannot reach Wikipedia.`,
        );
        this.warnedUnavailable = true;
      }
      this.logger.debug(`Wikipedia search failed for "${title}": ${reason}`);
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    this.logger.debug(`Wikipedia search failed for "${title}": ${message}`);
  }

  private async throttle(): Promise<void> {
    const interval = Number(process.env.WIKIPEDIA_REQUEST_INTERVAL_MS || 1000);
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const wait = interval - elapsed;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestTime = Date.now();
  }
}

// T3 completed
