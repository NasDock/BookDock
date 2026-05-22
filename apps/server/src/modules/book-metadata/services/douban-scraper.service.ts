import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import type { AnyNode, Element, Text } from 'domhandler';

export interface DoubanBookInfo {
  title: string;
  authors: string[];
  publisher?: string;
  publishedYear?: string;
  price?: string;
  pages?: number;
  isbn?: string;
  rating?: number;
  ratingCount?: number;
  coverUrl?: string;
  series?: string;
  tags?: string[];
  summary?: string;
  authorIntro?: string;
}

@Injectable()
export class DoubanScraperService {
  private readonly logger = new Logger(DoubanScraperService.name);
  private readonly http: AxiosInstance;
  private lastRequestTime = 0;

  constructor() {
    this.http = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://book.douban.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
      },
    });
  }

  /**
   * 通过书名搜索豆瓣图书，返回第一条搜索结果
   */
  async searchBook(
    title: string,
  ): Promise<{ url: string; title: string; coverUrl?: string; rating?: number } | null> {
    await this.throttle();

    const searchUrl = `https://book.douban.com/subject_search?search_text=${encodeURIComponent(title)}`;
    this.logger.debug(`Searching Douban: ${searchUrl}`);

    try {
      const { data: html } = await this.http.get(searchUrl);
      const match = html.match(/window\.__DATA__\s*=\s*"?({.+?})"?\s*;/);

      if (!match) {
        this.logger.warn('window.__DATA__ not found in search page');
        return null;
      }

      const data = JSON.parse(match[1]);
      const items = data.payload?.items || [];

      if (!items.length) {
        this.logger.warn(`No results for title: ${title}`);
        return null;
      }

      const first = items[0];
      return {
        url: first.url,
        title: first.title,
        coverUrl: first.cover_url ? this.enlargeCoverUrl(first.cover_url) : undefined,
        rating: first.rating?.value,
      };
    } catch (err) {
      this.logger.error(`searchBook failed for "${title}": ${err.message}`);
      return null;
    }
  }

  /**
   * 通过豆瓣图书详情页 URL 抓取完整信息
   */
  async fetchBookDetail(doubanUrl: string): Promise<DoubanBookInfo | null> {
    await this.throttle();

    this.logger.debug(`Fetching detail: ${doubanUrl}`);

    try {
      const { data: html } = await this.http.get(doubanUrl);
      const $ = cheerio.load(html);

      const title = $('span[property="v:itemreviewed"]').text().trim();
      if (!title) {
        this.logger.warn(`No title found at ${doubanUrl}`);
        return null;
      }

      // --- 解析 #info 区块 ---
      const infoText = $('#info').text();
      const infoHtml = $('#info').html() || '';

      const publisher = this.extractInfoField(infoText, '出版社');
      const publishedYear = this.extractInfoField(infoText, '出版年');
      const price = this.extractInfoField(infoText, '定价');
      const pagesMatch = infoText.match(/页数:\s*(\d+)/);
      const pages = pagesMatch ? parseInt(pagesMatch[1], 10) : undefined;
      const isbnMatch = infoText.match(/ISBN:\s*([\d-]+)/);
      const isbn = isbnMatch ? isbnMatch[1] : undefined;
      const series = this.extractInfoField(infoText, '丛书');

      // 作者：#info 中标签文本包含"作者"的 <a>
      const authors: string[] = [];
      $('#info')
        .contents()
        .each((_index: number, node: AnyNode) => {
          if (node.type === 'text' && 'data' in node && (node as Text).data.includes('作者')) {
            // 找到作者标签后的兄弟 <a> 标签
            let next = node.next;
            while (next) {
              if (next.type === 'tag' && (next as Element).name === 'a') {
                const name = cheerio.load(next).text().trim();
                if (name) authors.push(name);
              }
              next = next.next;
            }
          }
        });
      // 如果上面没取到，再尝试直接从 #info a 中过滤
      if (authors.length === 0) {
        $('#info a').each((_index: number, el: Element) => {
          const t = $(el).text().trim();
          if (t && !t.includes('更多')) authors.push(t);
        });
      }

      // 评分
      const ratingText = $('.rating_num').text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      // 评分人数
      const ratingCountText = $('.rating_sum .pl').text().trim();
      const ratingCountMatch = ratingCountText.match(/(\d+)/);
      const ratingCount = ratingCountMatch ? parseInt(ratingCountMatch[1], 10) : undefined;

      // 封面
      const rawCover = $('#mainpic img[src]').attr('src');
      const coverUrl = rawCover ? this.enlargeCoverUrl(rawCover) : undefined;

      // 标签
      const tags: string[] = [];
      $('.tag_collector .indent a.tag').each((_index: number, el: Element) => {
        const tag = $(el).text().trim();
        if (tag) tags.push(tag);
      });

      // 内容简介：#link-report .intro（排除 h2 标题）
      let summary: string | undefined;
      $('#link-report .intro').each((_index: number, el: Element) => {
        const $el = $(el);
        // 排除 h2 标题本身，取段落文字
        const text = $el
          .find('p')
          .map((_i: number, p: Element) => $(p).text().trim())
          .get()
          .join('\n');
        if (text) {
          summary = text;
          return false; // break
        }
      });
      // 如果 <p> 里没拿到，直接取文字
      if (!summary) {
        summary = $('#link-report .intro')
          .first()
          .text()
          .replace(/^\s*内容简介\s*/g, '')
          .trim();
        if (!summary) summary = undefined;
      }

      // 作者简介：.related_info 中包含"作者简介"的 .indent .intro
      let authorIntro: string | undefined;
      $('.related_info').each((_index: number, section: Element) => {
        const $section = $(section);
        const heading = $section.find('h2, .hd').text();
        if (heading.includes('作者简介')) {
          const text = $section
            .find('.indent .intro p')
            .map((_i: number, p: Element) => $(p).text().trim())
            .get()
            .join('\n');
          if (text) {
            authorIntro = text;
            return false;
          }
        }
      });

      return {
        title,
        authors,
        publisher,
        publishedYear,
        price,
        pages,
        isbn,
        rating,
        ratingCount,
        coverUrl,
        series,
        tags: tags.length ? tags : undefined,
        summary,
        authorIntro,
      };
    } catch (err) {
      this.logger.error(`fetchBookDetail failed for ${doubanUrl}: ${err.message}`);
      return null;
    }
  }

  /**
   * 一站式：按书名搜索并抓取详情
   */
  async fetchByTitle(title: string): Promise<DoubanBookInfo | null> {
    const searchResult = await this.searchBook(title);
    if (!searchResult?.url) {
      this.logger.warn(`No search result for title: ${title}`);
      return null;
    }
    return this.fetchBookDetail(searchResult.url);
  }

  /* ---------- 私有工具 ---------- */

  /**
   * 封面图 URL 替换为 large 尺寸
   */
  private enlargeCoverUrl(url: string): string {
    // https://img1.doubanio.com/view/subject/{size}/public/{id}.jpg
    return url.replace(/\/subject\/[sm]\//, '/subject/large/');
  }

  /**
   * 从 #info 纯文本中提取字段值
   */
  private extractInfoField(text: string, fieldName: string): string | undefined {
    const regex = new RegExp(`${fieldName}[:：]\\s*([^\\n]+)`);
    const match = text.match(regex);
    return match ? match[1].trim() : undefined;
  }

  /**
   * 反爬节流：确保两次请求间隔 ≥ 500 ms
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const wait = 500 - elapsed;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestTime = Date.now();
  }
}

// T2 completed
