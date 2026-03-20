import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { TtsService } from './tts.service';
import {
  CreateTtsJobDto,
  TtsJobQueryDto,
  TtsJobResponseDto,
  TtsVoiceDto,
  TtsAudioFileResponseDto,
} from './dto/tts.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('TTS')
@Controller('tts')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Get('voices')
  @ApiOperation({ summary: 'Get available TTS voices' })
  @ApiResponse({ status: 200, type: [TtsVoiceDto] })
  async getVoices() {
    return this.ttsService.getVoices();
  }

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
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200, type: TtsJobResponseDto })
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
  @ApiResponse({ status: 200, type: TtsJobResponseDto })
  async getJobStatus(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.ttsService.getJobStatus(jobId);
  }

  @Post('jobs/:jobId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a TTS job' })
  @ApiResponse({ status: 200, type: TtsJobResponseDto })
  async cancelJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ttsService.cancelJob(userId, jobId);
  }

  @Post('synthesize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Synthesize text to speech directly' })
  async synthesize(
    @Body() body: { text: string; voice?: string },
    @Res() res: Response,
    @CurrentUser('sub') userId: string,
  ) {
    const buffer = await this.ttsService.synthesizeText(body.text, body.voice);
    res.set({ 'Content-Type': 'audio/wav' });
    return res.send(buffer);
  }

  @Get('audio-files')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List completed TTS audio files' })
  @ApiResponse({ status: 200 })
  async getAudioFiles(
    @CurrentUser('sub') userId: string,
    @Query('bookId') bookId?: string,
  ) {
    return this.ttsService.getAudioFiles(userId, bookId);
  }
}
