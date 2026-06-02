import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface CoverDownloadResult {
  localPath: string;  // 本地绝对路径
  localUrl: string;   // API 可访问路径如 /covers/xxx.jpg
}

@Injectable()
export class CoverDownloaderService {
  private readonly logger = new Logger(CoverDownloaderService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 获取封面存储目录的绝对路径
   * 优先使用 CACHE_PATH，未设置时回退到 NAS_EBOOK_PATH/covers
   */
  private getCoversDir(): string {
    const cachePath = this.configService.get<string>('app.cachePath');
    if (cachePath) {
      return path.join(cachePath, 'covers');
    }
    const nasPath = this.configService.get<string>('app.nasEbookPath') || '/data/ebooks';
    return path.join(nasPath, 'covers');
  }

  /**
   * 获取封面存储目录的绝对路径（确保目录存在）
   */
  async ensureCoversDir(): Promise<string> {
    const coversDir = this.getCoversDir();

    try {
      await fs.mkdir(coversDir, { recursive: true });
    } catch (err) {
      this.logger.error(`Failed to create covers directory: ${coversDir}`, err);
      throw err;
    }

    return coversDir;
  }

  /**
   * 根据标识符获取封面文件的绝对路径
   */
  getCoverPath(identifier: string): string {
    const coversDir = this.getCoversDir();
    const filename = `${identifier}.jpg`;
    return path.join(coversDir, filename);
  }

  /**
   * 根据标识符获取可访问的 URL 路径
   */
  getCoverUrlPath(identifier: string): string {
    const filename = `${identifier}.jpg`;
    return `/covers/${filename}`;
  }

  /**
   * 下载外部封面图片到本地存储，并用 sharp 压缩
   * @param url 封面图片的远程 URL
   * @param identifier 书籍标识符（如 bookId 或 ISBN）
   * @returns 包含本地绝对路径和可访问 URL 的对象；失败返回 null
   */
  async downloadCover(
    url: string,
    identifier: string,
  ): Promise<CoverDownloadResult | null> {
    if (!url || !identifier) {
      this.logger.warn(`downloadCover called with invalid params: url=${url}, identifier=${identifier}`);
      return null;
    }

    try {
      // 1. 确保目录存在
      const coversDir = await this.ensureCoversDir();

      // 2. 生成文件名和路径（固定文件名，复用同一本书的封面）
      const filename = `${identifier}.jpg`;
      const localPath = path.join(coversDir, filename);
      const localUrl = `/covers/${filename}`;

      // 3. 构造请求头
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      // 如果 URL 是豆瓣的，添加豆瓣 Referer
      if (url.includes('douban.com') || url.includes('doubanio.com')) {
        headers['Referer'] = 'https://book.douban.com/';
      } else {
        // 通用 Referer，尝试提取 host
        try {
          const parsedUrl = new URL(url);
          headers['Referer'] = `${parsedUrl.protocol}//${parsedUrl.host}/`;
        } catch {
          headers['Referer'] = 'https://book.douban.com/';
        }
      }

      // 4. 下载图片
      this.logger.debug(`Downloading cover from ${url} with Referer: ${headers['Referer']}`);
      const response = await axios.get(url, {
        headers,
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024, // 10MB max
      });

      if (!response.data || response.data.length === 0) {
        this.logger.warn(`Empty response when downloading cover from ${url}`);
        return null;
      }

      // 5. 使用 sharp 压缩处理
      const imageBuffer = Buffer.from(response.data);
      const processedBuffer = await sharp(imageBuffer)
        .resize({
          width: 600,
          height: 800,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 80,
          progressive: true,
        })
        .toBuffer();

      // 6. 保存到本地
      await fs.writeFile(localPath, processedBuffer);

      this.logger.log(`Cover saved to ${localPath} (${processedBuffer.length} bytes)`);

      return {
        localPath,
        localUrl,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to download cover from ${url} for identifier ${identifier}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}

// T5 completed