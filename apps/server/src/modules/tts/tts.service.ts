/**
 * TTS Service — provider-aware gateway with file-based caching.
 *
 * Responsibilities:
 *  1. Accept a "synthesize paragraph" request (book + paragraph + voice).
 *  2. Compute a stable cache key from (provider, voice, rate, pitch, volume, text).
 *  3. If a cached mp3 exists on disk, return its URL.
 *  4. Otherwise call the Python tts-service, persist the result, and return its URL.
 *  5. List providers / voices by proxying to the Python service.
 *
 * Returns *URLs* (not raw buffers) so the client can play the audio
 * directly via <audio src="/audio/<hash>.mp3">.
 */
import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosError } from 'axios';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

import { TtsJobStatus } from '../../common/types/prisma-compat';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    CreateTtsJobDto,
    SynthesizeParagraphDto,
    SynthesizeParagraphResponseDto,
    TtsAudioFileResponseDto,
    TtsJobQueryDto,
    TtsJobResponseDto,
    TtsVoiceDto,
} from './dto/tts.dto';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  private readonly ttsServiceUrl: string;
  private readonly apiBaseUrl: string;
  private cacheDir: string;
  private readonly maxTextLength: number;
  private readonly timeoutMs: number;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    this.ttsServiceUrl = this.configService.get<string>('app.ttsServiceUrl') || 'http://localhost:5000';
    this.apiBaseUrl = this.configService.get<string>('app.apiBaseUrl') || 'http://localhost:8088';
    this.cacheDir = this.configService.get<string>('app.ttsAudioCacheDir') || '/data/audio';
    this.maxTextLength = this.configService.get<number>('app.ttsMaxTextLength') || 3000;
    this.timeoutMs = this.configService.get<number>('app.ttsMaxRequestTimeoutMs') || 30000;
    this._ensureCacheDir();
  }

  /**
   * Best-effort create of the cache dir. In container deployments this
   * is /data/audio (created by Dockerfile). In local dev the path may
   * not exist; fall back to <projectRoot>/.tts-cache so the server can
   * still start.
   */
  private _ensureCacheDir(): void {
    if (existsSync(this.cacheDir)) return;
    try {
      mkdirSync(this.cacheDir, { recursive: true });
    } catch {
      const fallback = join(process.cwd(), '.tts-cache');
      try {
        mkdirSync(fallback, { recursive: true });
        this.cacheDir = fallback;
        this.logger.warn(`TTS cache dir fallback: ${fallback}`);
      } catch (err) {
        this.logger.error(`Failed to create TTS cache dir: ${(err as Error).message}`);
        // Leave cacheDir as-is; subsequent writeFileSync calls will fail
        // with a clear error, which is preferable to crashing at startup.
      }
    }
  }

  // ─── Synthesize (paragraph-level, cached) ────────────────────────────────
  async synthesizeParagraph(
    userId: string,
    dto: SynthesizeParagraphDto,
  ): Promise<SynthesizeParagraphResponseDto> {
    const text = (dto.text || '').trim();
    if (!text) {
      throw new BadRequestException('text is required');
    }
    if (text.length > this.maxTextLength) {
      throw new BadRequestException(
        `text too long (${text.length} > ${this.maxTextLength}); split into smaller paragraphs`,
      );
    }

    const provider = dto.provider || this.configService.get<string>('app.ttsDefaultProvider') || 'edge';
    const rate = dto.rate ?? 1.0;
    const pitch = dto.pitch ?? 1.0;
    const volume = dto.volume ?? 1.0;
    const voice = dto.voice || this._defaultVoiceForProvider(provider);

    // 1. Cache lookup — disk is the source of truth.
    const contentHash = this._hashFor(provider, voice, rate, pitch, volume, text);
    const fileName = `${contentHash}.mp3`;
    const diskPath = join(this.cacheDir, fileName);
    const publicUrl = `/audio/${fileName}`;

    if (existsSync(diskPath)) {
      const size = statSync(diskPath).size;
      this.logger.debug(`TTS cache hit: ${fileName}`);
      return {
        url: publicUrl,
        contentHash,
        provider,
        voice,
        bytes: size,
        cached: true,
      };
    }

    // 2. Cache miss — call Python service.
    let audioBuffer: Buffer;
    try {
      const resp = await axios.post(
        `${this.ttsServiceUrl}/synthesize`,
        { text, voice, provider, rate, pitch, volume, audio_format: 'mp3' },
        {
          responseType: 'arraybuffer',
          timeout: this.timeoutMs,
        },
      );
      const data: any = resp.data;
      audioBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    } catch (err) {
      const ax = err as AxiosError;
      const respData: any = ax.response?.data;
      const detail = respData
        ? (Buffer.isBuffer(respData) ? respData.toString('utf-8') : String(respData)).slice(0, 500)
        : ax.message;
      this.logger.error(`TTS service error: ${detail}`);
      throw new BadRequestException(`TTS synthesis failed: ${detail}`);
    }

    // 3. Write to disk and DB.
    try {
      writeFileSync(diskPath, audioBuffer);
    } catch (err) {
      this.logger.error(`Failed to write TTS audio to ${diskPath}: ${err}`);
      throw new BadRequestException('TTS cache write failed');
    }
    await this._upsertAudioFile(
      dto.bookId, dto.paragraphId, provider, voice, contentHash,
      diskPath, publicUrl, audioBuffer.length,
    );
    await this._recordUsage(userId, audioBuffer.length);

    return {
      url: publicUrl,
      contentHash,
      provider,
      voice,
      bytes: audioBuffer.length,
      cached: false,
    };
  }

  // ─── Providers / voices proxy ────────────────────────────────────────────
  async getProviders(): Promise<{ providers: any[]; default?: string }> {
    try {
      const resp = await axios.get(`${this.ttsServiceUrl}/providers`, { timeout: 5000 });
      return resp.data;
    } catch (err) {
      this.logger.error(`Failed to list TTS providers: ${(err as Error).message}`);
      return { providers: [] };
    }
  }

  async getVoicesByProvider(provider: string, language?: string): Promise<Array<{id: string; name: string; language: string; gender: string; description?: string; sample_rate?: number}>> {
    try {
      const resp = await axios.get(`${this.ttsServiceUrl}/providers/${provider}/voices`, {
        params: language ? { language } : undefined,
        timeout: 15000,
      });
      return (resp.data?.voices || []) as Array<{id: string; name: string; language: string; gender: string; description?: string; sample_rate?: number}>;
    } catch (err) {
      this.logger.error(`Failed to list voices for ${provider}: ${(err as Error).message}`);
      return [];
    }
  }

  // ─── Backwards-compatible /synthesize wrapper (old single-blob API) ──────
  /** @deprecated prefer synthesizeParagraph (returns URL, supports caching). */
  async synthesizeText(text: string, voice?: string): Promise<Buffer> {
    try {
      const resp = await axios.post(
        `${this.ttsServiceUrl}/synthesize`,
        { text, voice: voice || 'en-US-AriaNeural' },
        { responseType: 'arraybuffer', timeout: this.timeoutMs },
      );
      return Buffer.from(resp.data);
    } catch (err) {
      this.logger.error(`TTS synthesis failed: ${(err as Error).message}`);
      throw new BadRequestException('TTS synthesis failed');
    }
  }

  // ─── TTS Job CRUD (kept from old API) ────────────────────────────────────
  async createJob(userId: string, dto: CreateTtsJobDto): Promise<TtsJobResponseDto> {
    const job = await this.prisma.ttsJob.create({
      data: {
        userId,
        bookId: dto.bookId,
        status: TtsJobStatus.pending,
        voice: dto.voice || 'en_US-lessac-medium',
        gender: dto.gender || 'neutral',
        sampleRate: dto.sampleRate || 22050,
        startCfi: dto.startCfi,
        endCfi: dto.endCfi,
      },
    });
    try {
      await this.synthesizeText(dto.text || '', dto.voice);
      await this.prisma.ttsJob.update({
        where: { id: job.id },
        data: { status: TtsJobStatus.completed, completedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`TTS job ${job.id} failed: ${error}`);
      await this.prisma.ttsJob.update({
        where: { id: job.id },
        data: { status: TtsJobStatus.failed, errorMessage: String(error) },
      });
    }
    return this.toJobResponse(await this.prisma.ttsJob.findUnique({ where: { id: job.id } }));
  }

  async findJobs(userId: string, query: TtsJobQueryDto) {
    const { page = 1, limit = 20, bookId } = query;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { userId };
    if (bookId) where.bookId = bookId;
    const [jobs, total] = await Promise.all([
      this.prisma.ttsJob.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.ttsJob.count({ where }),
    ]);
    return { data: jobs.map((j) => this.toJobResponse(j)), total };
  }

  async findJob(userId: string, jobId: string): Promise<TtsJobResponseDto> {
    const job = await this.prisma.ttsJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException(`TTS job ${jobId} not found`);
    return this.toJobResponse(job);
  }

  async cancelJob(userId: string, jobId: string): Promise<TtsJobResponseDto> {
    const job = await this.prisma.ttsJob.findFirst({
      where: { id: jobId, userId, status: { in: ['pending', 'processing'] } },
    });
    if (!job) throw new BadRequestException('Job cannot be cancelled');
    const updated = await this.prisma.ttsJob.update({
      where: { id: jobId },
      data: { status: TtsJobStatus.failed, errorMessage: 'Cancelled by user' },
    });
    return this.toJobResponse(updated);
  }

  async getJobStatus(jobId: string): Promise<TtsJobResponseDto> {
    const job = await this.prisma.ttsJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`TTS job ${jobId} not found`);
    return this.toJobResponse(job);
  }

  async getVoices(): Promise<TtsVoiceDto[]> {
    return [
      { id: 'en-US-AriaNeural', name: 'en-US-AriaNeural', language: 'en-US', gender: 'female', description: 'Edge TTS: Aria (US English, female)' },
      { id: 'en-US-GuyNeural', name: 'en-US-GuyNeural', language: 'en-US', gender: 'male', description: 'Edge TTS: Guy (US English, male)' },
      { id: 'zh-CN-XiaoxiaoNeural', name: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN', gender: 'female', description: 'Edge TTS: Xiaoxiao (Mandarin, female)' },
      { id: 'zh-CN-YunxiNeural', name: 'zh-CN-YunxiNeural', language: 'zh-CN', gender: 'male', description: 'Edge TTS: Yunxi (Mandarin, male)' },
      { id: 'ja-JP-NanamiNeural', name: 'ja-JP-NanamiNeural', language: 'ja-JP', gender: 'female', description: 'Edge TTS: Nanami (Japanese, female)' },
    ];
  }

  async getAudioFiles(userId: string, bookId?: string): Promise<TtsAudioFileResponseDto[]> {
    const where: Record<string, unknown> = { userId };
    if (bookId) where.bookId = bookId;
    const files = await this.prisma.ttsAudioFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return files.map((f) => ({
      id: f.id,
      bookId: f.bookId,
      fileUrl: f.fileUrl || undefined,
      fileSize: f.fileSize || undefined,
      durationSecs: f.durationSecs ? Number(f.durationSecs) : undefined,
      voice: f.voice || '',
      createdAt: f.createdAt,
    }));
  }

  // ─── Internals ───────────────────────────────────────────────────────────
  private _hashFor(
    provider: string,
    voice: string,
    rate: number,
    pitch: number,
    volume: number,
    text: string,
  ): string {
    return createHash('sha256')
      .update(`${provider}|${voice}|${rate}|${pitch}|${volume}|${text}`)
      .digest('hex');
  }

  private _defaultVoiceForProvider(provider: string): string {
    switch (provider) {
      case 'edge':
        return 'en-US-AriaNeural';
      case 'mi':
        return 'mi-xiaoyou-female';
      default:
        return 'en-US-AriaNeural';
    }
  }

  private async _upsertAudioFile(
    bookId: string | undefined,
    paragraphId: string | undefined,
    provider: string,
    voice: string,
    contentHash: string,
    filePath: string,
    fileUrl: string,
    fileSize: number,
  ): Promise<void> {
    // TtsAudioFile.bookId is optional; store null when no book is associated.
    try {
      const existing = await this.prisma.ttsAudioFile.findFirst({
        where: { contentHash },
      });
      if (existing) {
        await this.prisma.ttsAudioFile.update({
          where: { id: existing.id },
          data: { fileUrl, fileSize: BigInt(fileSize) },
        });
        return;
      }
      await this.prisma.ttsAudioFile.create({
        data: {
          bookId: bookId || undefined,
          filePath,
          fileUrl,
          fileSize: BigInt(fileSize),
          voice,
          contentHash,
        },
      });
    } catch (err) {
      this.logger.warn(`TtsAudioFile upsert skipped: ${(err as Error).message}`);
    }
  }

  /**
   * Increment the user's TTS minutes used this month.
   * Called after a successful cache miss (i.e. a fresh synthesis).
   * Cached hits don't count — they're just a disk read.
   */
  private async _recordUsage(userId: string, audioBytes: number, sampleRate = 24000): Promise<void> {
    // Approximate duration: 16-bit mono = 2 bytes/sample.
    const seconds = audioBytes / (sampleRate * 2);
    const minutes = seconds / 60;
    if (minutes < 0.05) return;

    const monthKey = new Date().toISOString().slice(0, 7);
    try {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      const prefs = JSON.parse(u?.preferences || '{}');
      const prev = prefs.ttsUsageByMonth?.[monthKey] || 0;
      prefs.ttsUsageByMonth = { ...(prefs.ttsUsageByMonth || {}), [monthKey]: prev + minutes };
      await this.prisma.user.update({ where: { id: userId }, data: { preferences: JSON.stringify(prefs) } });
    } catch (err) {
      this.logger.warn(`Failed to record TTS usage: ${(err as Error).message}`);
    }
  }

  private toJobResponse(j: any): TtsJobResponseDto {
    return {
      id: j.id,
      bookId: j.bookId || undefined,
      status: j.status,
      voice: j.voice,
      gender: j.gender,
      sampleRate: j.sampleRate,
      startCfi: j.startCfi || undefined,
      endCfi: j.endCfi || undefined,
      outputPath: j.outputPath || undefined,
      outputUrl: j.outputUrl || undefined,
      fileSize: j.fileSize || undefined,
      durationSecs: j.durationSecs ? Number(j.durationSecs) : undefined,
      errorMessage: j.errorMessage || undefined,
      retryCount: j.retryCount,
      createdAt: j.createdAt,
      completedAt: j.completedAt || undefined,
    };
  }
}
