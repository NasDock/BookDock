import { InjectQueue } from '@nestjs/bullmq';
import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, TtsJobStatus } from '@prisma/client';
import axios from 'axios';
import { Queue } from 'bullmq';
import { PRISMA_CLIENT } from '../../config/database.module';
import { CreateTtsJobDto, TtsAudioFileResponseDto, TtsJobQueryDto, TtsJobResponseDto, TtsVoiceDto } from './dto/tts.dto';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly ttsApiUrl: string;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @InjectQueue('tts-synthesize') private readonly ttsQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.ttsApiUrl = this.configService.get<string>('app.ttsApiUrl') || 'http://localhost:5000';
  }

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

    // Enqueue BullMQ job
    await this.ttsQueue.add('synthesize', {
      jobId: job.id,
      userId,
      bookId: dto.bookId,
      voice: dto.voice || 'en_US-lessac-medium',
      startCfi: dto.startCfi,
      endCfi: dto.endCfi,
      sampleRate: dto.sampleRate || 22050,
    });

    return this.toJobResponse(job);
  }

  async findJobs(userId: string, query: TtsJobQueryDto): Promise<{ data: TtsJobResponseDto[]; total: number }> {
    const { page = 1, limit = 20, bookId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (bookId) where.bookId = bookId;

    const [jobs, total] = await Promise.all([
      this.prisma.ttsJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ttsJob.count({ where }),
    ]);

    return { data: jobs.map((j) => this.toJobResponse(j)), total };
  }

  async findJob(userId: string, jobId: string): Promise<TtsJobResponseDto> {
    const job = await this.prisma.ttsJob.findFirst({
      where: { id: jobId, userId },
    });

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

  async getVoices(): Promise<TtsVoiceDto[]> {
    // Return list of available Piper TTS voices
    // In production, this would call the TTS service API
    return [
      { id: 'en_US-lessac-medium', name: 'en_US-lessac-medium', language: 'en', gender: 'neutral', description: 'US English, Lessac medium quality' },
      { id: 'en_US-lessac-high', name: 'en_US-lessac-high', language: 'en', gender: 'neutral', description: 'US English, Lessac high quality' },
      { id: 'en_GB-semaine-medium', name: 'en_GB-semaine-medium', language: 'en-GB', gender: 'neutral', description: 'British English, Semaine medium' },
      { id: 'en_US-kathleen-medium', name: 'en_US-kathleen-medium', language: 'en', gender: 'female', description: 'US English, Female voice' },
      { id: 'en_US-ryan-medium', name: 'en_US-ryan-medium', language: 'en', gender: 'male', description: 'US English, Male voice' },
      { id: 'zh_CN-huayan-medium', name: 'zh_CN-huayan-medium', language: 'zh', gender: 'female', description: 'Mandarin Chinese, Female' },
    ];
  }

  async synthesizeText(text: string, voice?: string): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.ttsApiUrl}/synthesize`,
        { text, voice: voice || 'en_US-lessac-medium' },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(`TTS synthesis failed: ${error}`);
      throw new BadRequestException('TTS synthesis failed');
    }
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

  async getJobStatus(jobId: string): Promise<TtsJobResponseDto> {
    const job = await this.prisma.ttsJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`TTS job ${jobId} not found`);
    return this.toJobResponse(job);
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
