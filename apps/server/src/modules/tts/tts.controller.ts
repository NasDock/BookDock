import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Res,
    UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
    CreateTtsJobDto,
    SynthesizeParagraphDto,
    SynthesizeParagraphResponseDto,
    TtsJobQueryDto,
    TtsJobResponseDto,
    TtsVoiceDto
} from './dto/tts.dto';
import { TtsQuotaGuard } from './tts-quota.guard';
import { TtsService } from './tts.service';

@ApiTags('TTS')
@Controller('tts')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  // ─── Provider discovery ────────────────────────────────────────────────
  @Get('providers')
  @ApiOperation({ summary: 'List available TTS providers and their health' })
  async getProviders() {
    return this.ttsService.getProviders();
  }

  @Get('voices')
  @ApiOperation({ summary: 'List voices for a provider (defaults to edge)' })
  async getVoices(@Query('provider') provider?: string, @Query('language') language?: string) {
    const p = provider || 'edge';
    return this.ttsService.getVoicesByProvider(p, language);
  }

  @Get('voices-legacy')
  @ApiOperation({ summary: 'Static list of well-known Edge voices (legacy)' })
  @ApiResponse({ status: 200, type: [TtsVoiceDto] })
  async getVoicesLegacy(): Promise<TtsVoiceDto[]> {
    return this.ttsService.getVoices();
  }

  // ─── Paragraph-level synthesize (the new path) ─────────────────────────
  @Post('synthesize')
  @UseGuards(JwtAuthGuard, TtsQuotaGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Synthesize a single paragraph to audio (cached on disk, returns URL)',
  })
  @ApiResponse({ status: 201, type: SynthesizeParagraphResponseDto })
  @HttpCode(201)
  async synthesizeParagraph(
    @Body() dto: SynthesizeParagraphDto,
    @CurrentUser('sub') userId: string,
  ): Promise<SynthesizeParagraphResponseDto> {
    return this.ttsService.synthesizeParagraph(userId, dto);
  }

  // ─── Legacy raw-blob synthesize (kept for old mobile TTSScreen) ────────
  @Post('synthesize-blob')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[deprecated] Synthesize text and return raw audio buffer' })
  async synthesizeBlob(
    @Body() body: { text: string; voice?: string; provider?: string; rate?: number; pitch?: number; volume?: number },
    @Res() res: Response,
    @CurrentUser('sub') _userId: string,
  ) {
    const buffer = await this.ttsService.synthesizeText(body.text, body.voice);
    res.set({ 'Content-Type': 'audio/mpeg' });
    return res.send(buffer);
  }

  // ─── TTS Jobs CRUD (kept from old API) ─────────────────────────────────
  @Post('jobs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new TTS synthesis job' })
  @ApiResponse({ status: 201, type: TtsJobResponseDto })
  async createJob(
    @Body() dto: CreateTtsJobDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ttsService.createJob(userId, dto);
  }

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List TTS jobs for current user' })
  async findJobs(
    @CurrentUser('sub') userId: string,
    @Query() query: TtsJobQueryDto,
  ) {
    return this.ttsService.findJobs(userId, query);
  }

  @Get('jobs/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific TTS job' })
  async findJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ttsService.findJob(userId, jobId);
  }

  @Get('jobs/:jobId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poll TTS job status' })
  async getJobStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser('sub') _userId: string,
  ) {
    return this.ttsService.getJobStatus(jobId);
  }

  @Post('jobs/:jobId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a TTS job' })
  async cancelJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ttsService.cancelJob(userId, jobId);
  }

  @Get('audio-files')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List completed TTS audio files' })
  async getAudioFiles(
    @CurrentUser('sub') userId: string,
    @Query('bookId') bookId?: string,
  ) {
    return this.ttsService.getAudioFiles(userId, bookId);
  }
}
