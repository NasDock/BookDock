import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import type { AnyNode, Element, Text } from 'domhandler';

const execFileAsync = promisify(execFile);

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
  private readonly userAgent: string;
  private readonly cookie: string | undefined;
  private lastRequestTime = 0;
  private warnedBlocked = false;

  constructor() {
    this.cookie = this.normalizeCookie(process.env.DOUBAN_COOKIE);
    this.userAgent =
      process.env.METADATA_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

    if (this.cookie) {
      this.logger.log('DOUBAN_COOKIE detected; authenticated Douban requests are enabled.');
    }
  }

  /**
   * 清理书名，去掉前缀噪音
   * 例如 "韩寒：通稿2003" -> "通稿2003"
   * 例如 "1975 天涯·明月·刀" -> "天涯·明月·刀"
   * 例如 "2.8《微纪元》" -> "微纪元"
   * 例如 "[小说] 三体" -> "三体"
   */
  private cleanTitle(title: string): string {
    let cleaned = title.trim();
    // 去掉开头的 "作者名：" 或 "作者名:" 前缀
    cleaned = cleaned.replace(/^[^：:]+[：:]\s*/, '');
    // 去掉开头的数字+点号（如 "2.8 "、"1 "）
    cleaned = cleaned.replace(/^\d+(\.\d+)?\s*/, '');
    // 去掉书名号《》
    cleaned = cleaned.replace(/[《》]/g, '');
    // 去掉方括号及内容（如 "[小说] "、"[已读] "）
    cleaned = cleaned.replace(/^\[[^\]]*\]\s*/, '');
    // 去掉开头的 4 位年份数字（如 "1975 "、"2003 "）
    cleaned = cleaned.replace(/^\d{4}\s+/, '');
    return cleaned.trim();
  }

  /**
   * 通过 curl 发送 HTTP GET 请求，返回响应体字符串
   */
  private async curlGet(url: string, useCookie = true): Promise<string> {
    const args = [
      '-s', // silent
      '-L', // follow redirects
      '-m', '20', // max time 20s
      '--compressed',
      '-H', `User-Agent: ${this.userAgent}`,
      '-H', 'Referer: https://book.douban.com/',
      '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7,en-US;q=0.6',
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      '-H', 'Accept-Encoding: gzip, deflate',
      '-H', 'Cache-Control: no-cache',
      '-H', 'Pragma: no-cache',
      '-H', 'Connection: keep-alive',
      '-H', 'Priority: u=0, i',
      '-H', 'Sec-Ch-Ua: "Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
      '-H', 'Sec-Ch-Ua-Mobile: ?0',
      '-H', 'Sec-Ch-Ua-Platform: "macOS"',
      '-H', 'Sec-Fetch-Dest: document',
      '-H', 'Sec-Fetch-Mode: navigate',
      '-H', 'Sec-Fetch-Site: none',
      '-H', 'Sec-Fetch-User: ?1',
      '-H', 'Upgrade-Insecure-Requests: 1',
    ];

    if (useCookie && this.cookie) {
      args.push('-H', `Cookie: ${this.cookie}`);
    }

    // 代理支持
    if (process.env.HTTPS_PROXY) {
      args.push('-x', process.env.HTTPS_PROXY);
    } else if (process.env.HTTP_PROXY) {
      args.push('-x', process.env.HTTP_PROXY);
    }

    args.push(url);

    try {
      const { stdout, stderr } = await execFileAsync('curl', args, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 25000,
      });

      if (stderr) {
        this.logger.debug(`curl stderr: ${stderr}`);
      }

      return stdout;
    } catch (err: any) {
      // curl 可能返回非 0 退出码但 stdout 已有数据（如连接被重置但响应已接收完）
      const stdout = err?.stdout;
      if (typeof stdout === 'string' && stdout.length > 0) {
        this.logger.debug(`curl exited with code ${err.code} but returned ${stdout.length} bytes`);
        return stdout;
      }
      throw err;
    }
  }

  /**
   * 通过书名搜索豆瓣图书，返回第一条搜索结果
   * 只使用 j/subject_suggest 接口
   */
  async searchBook(
    title: string,
  ): Promise<{ url: string; title: string; coverUrl?: string; rating?: number; authorName?: string } | null> {
    await this.throttle();

    const cleanTitle = this.cleanTitle(title);
    const searchUrl = `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(cleanTitle)}`;

    this.logger.debug(`Searching Douban: ${searchUrl}`);

    // 先尝试带 cookie
    for (const useCookie of [true, false]) {
      try {
        const raw = await this.curlGet(searchUrl, useCookie);

        // 如果返回的是 HTML（风控页面），跳过
        if (raw.trim().startsWith('<')) {
          this.logger.debug(`Douban returned HTML instead of JSON (cookie=${useCookie}), retrying...`);
          continue;
        }

        const data = JSON.parse(raw);

        if (Array.isArray(data) && data.length > 0) {
          const first = data.find((item) => item?.url || item?.id);
          if (first) {
            return {
              url: first.url || `https://book.douban.com/subject/${first.id}/`,
              title: first.title || first.name || '',
              coverUrl: first.pic ? this.enlargeCoverUrl(first.pic) : undefined,
              rating: first.rating ? Number(first.rating) : undefined,
              authorName: first.author_name ? String(first.author_name).trim() : undefined,
            };
          }
        }
      } catch (err) {
        this.logRequestError('searchBook', title, err);
      }
    }

    this.logger.warn(`No search result for title: ${title} (cleaned: ${cleanTitle})`);
    return null;
  }

  /**
   * 通过豆瓣图书详情页 URL 抓取完整信息
   */
  async fetchBookDetail(doubanUrl: string): Promise<DoubanBookInfo | null> {
    await this.throttle();

    this.logger.debug(`Fetching detail: ${doubanUrl}`);

    try {
      const html = await this.curlGet(doubanUrl);
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

      // 作者：多策略解析，兼容新旧页面结构
      const authors = this.extractAuthors($, infoText);

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
      this.logger.log(`[DoubanScraper] tags scraped for "${title}": ${JSON.stringify(tags)} (selector matched ${tags.length} tags)`);

      // 内容简介 & 作者简介
      const summary = this.extractSummary($);
      const authorIntro = this.extractAuthorIntro($);

      const result = {
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
      this.logger.log(`[DoubanScraper] fetchBookDetail result for "${title}": ${JSON.stringify(result)}`);
      return result;
    } catch (err) {
      this.logRequestError('fetchBookDetail', doubanUrl, err);
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

  private logRequestError(action: string, target: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      if (!this.warnedBlocked) {
        this.logger.warn(
          `Douban blocked metadata requests with 403. Refresh DOUBAN_COOKIE or set HTTPS_PROXY if your network/IP is blocked.`,
        );
        this.warnedBlocked = true;
      }
      this.logger.debug(`${action} blocked for "${target}": HTTP 403`);
      return;
    }

    this.logger.warn(`${action} failed for "${target}": ${message}`);
  }

  private normalizeCookie(cookie: string | undefined): string | undefined {
    if (!cookie) return undefined;

    const trimmed = cookie.trim().replace(/^Cookie:\s*/i, '');
    const unwrapped =
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ? trimmed.slice(1, -1)
        : trimmed;

    return unwrapped.replace(/\r?\n/g, '').replace(/\s*;\s*/g, '; ').trim();
  }

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
   * 多策略提取作者列表，兼容新旧页面结构
   */
  private extractAuthors($: cheerio.CheerioAPI, infoText: string): string[] {
    const authors: string[] = [];

    // 策略1：#info 中标签文本包含"作者"的 <a> 兄弟节点
    $('#info')
      .contents()
      .each((_index: number, node: AnyNode) => {
        if (node.type === 'text' && 'data' in node && (node as Text).data.includes('作者')) {
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
    if (authors.length > 0) return authors;

    // 策略2：#info a 中 href 包含 /author/ 的链接
    $('#info a').each((_index: number, el: Element) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const t = $el.text().trim();
      if (t && !t.includes('更多') && href.includes('/author/')) {
        authors.push(t);
      }
    });
    if (authors.length > 0) return authors;

    // 策略3：从 #info 纯文本中用正则提取（处理无链接的情况）
    // 匹配 "作者: xxx" 或 "作者：xxx"，支持中英文作者名
    const authorMatch = infoText.match(/作者[:：]\s*([^\n]+)/);
    if (authorMatch) {
      const raw = authorMatch[1].trim();
      // 按 / 或 空格 分割多个作者
      const splitAuthors = raw.split(/\s*\/\s*|\s+/).filter((s) => s.length > 0 && !s.match(/^(更多|…)$/));
      if (splitAuthors.length > 0) return splitAuthors;
    }

    // 策略4：从页面 meta 或 script 数据中提取（部分新版页面）
    const scriptData = $('script[type="application/ld+json"]').html();
    if (scriptData) {
      try {
        const json = JSON.parse(scriptData);
        if (json.author) {
          const authorList = Array.isArray(json.author) ? json.author : [json.author];
          const names = authorList
            .map((a: any) => (typeof a === 'string' ? a : a.name))
            .filter((s: string) => s && s.trim())
            .map((s: string) => s.trim());
          if (names.length > 0) return names;
        }
      } catch {
        // ignore JSON parse error
      }
    }

    return authors;
  }

  /**
   * 提取内容简介，兼容多种页面结构
   */
  private extractSummary($: cheerio.CheerioAPI): string | undefined {
    let summary: string | undefined;

    // 策略1：从 .related_info 区块按标题匹配
    // 页面结构：每个 .related_info 包含 h2(标题) + .indent > .intro(内容)
    // 必须严格限定在当前 section 的直接子 .indent 中查找
    $('.related_info').each((_index: number, section: Element) => {
      const $section = $(section);
      const heading = $section.children('h2, .hd').first().text().trim();
      if (heading.includes('内容简介') && !summary) {
        // 限定在当前 section 的直接子 .indent 中查找 .intro
        const $indent = $section.children('.indent').first();
        const text = $indent
          .find('.intro > p')
          .map((_i: number, p: Element) => $(p).text().trim())
          .get()
          .join('\n');
        if (text) {
          summary = text;
        } else {
          const fallback = $indent.children('.intro').first().text()
            .replace(/^\s*内容简介\s*/g, '')
            .trim();
          if (fallback) summary = fallback;
        }
      }
      if (summary) return false;
    });
    if (summary) return summary;

    // 策略2：兼容旧版 #link-report 结构
    $('#link-report .intro').each((_index: number, el: Element) => {
      const $el = $(el);
      const text = $el
        .find('p')
        .map((_i: number, p: Element) => $(p).text().trim())
        .get()
        .join('\n');
      if (text) {
        summary = text;
        return false;
      }
    });
    if (!summary) {
      summary = $('#link-report .intro')
        .first()
        .text()
        .replace(/^\s*内容简介\s*/g, '')
        .trim();
    }
    if (summary) return summary;

    // 策略3：从 meta description 中提取
    const metaDesc = $('meta[name="description"]').attr('content');
    if (metaDesc) {
      const desc = metaDesc.trim();
      if (desc.length > 20) return desc;
    }

    // 策略4：从 script ld+json 中提取
    const scriptData = $('script[type="application/ld+json"]').html();
    if (scriptData) {
      try {
        const json = JSON.parse(scriptData);
        if (json.description && typeof json.description === 'string') {
          return json.description.trim();
        }
      } catch {
        // ignore
      }
    }

    return summary;
  }

  /**
   * 提取作者简介，兼容多种页面结构
   */
  private extractAuthorIntro($: cheerio.CheerioAPI): string | undefined {
    let authorIntro: string | undefined;

    // 策略1：从 .related_info 区块按标题匹配
    // 关键：必须用 children() 限定在当前 section 内，避免跨 section 查找
    $('.related_info').each((_index: number, section: Element) => {
      const $section = $(section);
      const heading = $section.children('h2, .hd').first().text().trim();
      if (heading.includes('作者简介') && !authorIntro) {
        const $indent = $section.children('.indent').first();
        const text = $indent
          .find('.intro > p')
          .map((_i: number, p: Element) => $(p).text().trim())
          .get()
          .join('\n');
        if (text) {
          authorIntro = text;
        } else {
          const fallback = $indent.children('.intro').first().text()
            .replace(/^\s*作者简介\s*/g, '')
            .trim();
          if (fallback) authorIntro = fallback;
        }
      }
      if (authorIntro) return false;
    });
    if (authorIntro) return authorIntro;

    // 策略2：查找独立的作者简介区块（非 .related_info 结构）
    $('section, div').each((_index: number, el: Element) => {
      const $el = $(el);
      const heading = $el.children('h2, h3, .hd').first().text().trim();
      if (heading.includes('作者简介') && !authorIntro) {
        const text = $el.find('> .indent > .intro > p, > p')
          .map((_i: number, p: Element) => $(p).text().trim())
          .get()
          .join('\n');
        if (text) {
          authorIntro = text;
          return false;
        }
        const fallback = $el.text().replace(/^\s*作者简介\s*/g, '').trim();
        if (fallback) {
          authorIntro = fallback;
          return false;
        }
      }
    });
    if (authorIntro) return authorIntro;

    // 策略3：从 script ld+json 中提取
    const scriptData = $('script[type="application/ld+json"]').html();
    if (scriptData) {
      try {
        const json = JSON.parse(scriptData);
        const graph = json['@graph'];
        if (Array.isArray(graph)) {
          for (const item of graph) {
            if (item['@type'] === 'Person' && item.description) {
              return item.description.trim();
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return authorIntro;
  }

  /**
   * 反爬节流：确保两次请求间隔足够长
   */
  private async throttle(): Promise<void> {
    const interval = Number(process.env.DOUBAN_REQUEST_INTERVAL_MS || 3000);
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const wait = interval - elapsed;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestTime = Date.now();
  }
}
