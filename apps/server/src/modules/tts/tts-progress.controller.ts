import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SaveTtsProgressDto, TtsProgressResponseDto } from './dto/tts-progress.dto';
import { TtsProgressService } from './tts-progress.service';

@ApiTags('TTS Progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tts/progress')
export class TtsProgressController {
  constructor(private readonly progressService: TtsProgressService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Save TTS reading progress for a (book, chapter)' })
  async save(
    @Body() dto: SaveTtsProgressDto,
    @CurrentUser('sub') userId: string,
  ): Promise<TtsProgressResponseDto> {
    return this.progressService.save(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get TTS reading progress for a book (or specific chapter)' })
  async get(
    @Query('bookId', ParseUUIDPipe) bookId: string,
    @Query('chapterIndex') chapterIndex: string | undefined,
    @CurrentUser('sub') userId: string,
  ): Promise<TtsProgressResponseDto | TtsProgressResponseDto[] | null> {
    const ci = chapterIndex !== undefined ? parseInt(chapterIndex, 10) : undefined;
    if (ci === undefined) {
      return this.progressService.getAllForBook(userId, bookId);
    }
    return this.progressService.get(userId, bookId, ci);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete TTS reading progress for a book' })
  async remove(
    @Query('bookId', ParseUUIDPipe) bookId: string,
    @Query('chapterIndex') chapterIndex: string | undefined,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    const ci = chapterIndex !== undefined ? parseInt(chapterIndex, 10) : undefined;
    await this.progressService.delete(userId, bookId, ci);
  }
}
