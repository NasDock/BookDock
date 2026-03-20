import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
    BookBookmarkDto,
    BookmarkResponseDto,
    ReadingProgressQueryDto,
    ReadingProgressResponseDto,
    ReadingStatsDto,
    SyncReadingDto,
    UpdateReadingProgressDto,
} from './dto/reading-progress.dto';
import { ReadingProgressService } from './reading-progress.service';

@ApiTags('Reading Progress')
@Controller('reading-progress')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReadingProgressController {
  constructor(private readonly progressService: ReadingProgressService) {}

  @Post('books/:bookId')
  @ApiOperation({ summary: 'Update reading progress for a book' })
  @ApiResponse({ status: 200, type: ReadingProgressResponseDto })
  async upsert(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() dto: UpdateReadingProgressDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.progressService.upsert(userId, bookId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all reading progress for current user' })
  @ApiResponse({ status: 200 })
  async findAll(
    @CurrentUser('sub') userId: string,
    @Query() query: ReadingProgressQueryDto,
  ) {
    return this.progressService.findAll(userId, query);
  }

  @Get('books/:bookId')
  @ApiOperation({ summary: 'Get reading progress for a specific book' })
  @ApiResponse({ status: 200, type: ReadingProgressResponseDto })
  async findOne(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.progressService.findOne(userId, bookId);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync reading progress (batch update)' })
  @ApiResponse({ status: 200 })
  async sync(
    @Body() dto: SyncReadingDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.progressService.sync(userId, dto.bookId, dto.items);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get reading statistics for current user' })
  @ApiResponse({ status: 200, type: ReadingStatsDto })
  async getStats(@CurrentUser('sub') userId: string) {
    return this.progressService.getStats(userId);
  }

  // ── Bookmarks ───────────────────────────────────────────────────────────────

  @Post('bookmarks')
  @ApiOperation({ summary: 'Create a bookmark' })
  @ApiResponse({ status: 201, type: BookmarkResponseDto })
  async createBookmark(
    @Body() dto: BookBookmarkDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.progressService.createBookmark(userId, (dto as any).bookId || '', dto);
  }

  @Post('bookmarks/:bookId')
  @ApiOperation({ summary: 'Create a bookmark for a book' })
  @ApiResponse({ status: 201, type: BookmarkResponseDto })
  async createBookmarkForBook(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() dto: BookBookmarkDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.progressService.createBookmark(userId, bookId, dto);
  }

  @Get('bookmarks')
  @ApiOperation({ summary: 'Get all bookmarks' })
  @ApiResponse({ status: 200, type: [BookmarkResponseDto] })
  async findBookmarks(
    @CurrentUser('sub') userId: string,
    @Query('bookId') bookId?: string,
  ) {
    return this.progressService.findBookmarks(userId, bookId);
  }

  @Put('bookmarks/:bookmarkId')
  @ApiOperation({ summary: 'Update a bookmark' })
  @ApiResponse({ status: 200, type: BookmarkResponseDto })
  async updateBookmark(
    @Param('bookmarkId', ParseUUIDPipe) bookmarkId: string,
    @Body() dto: Partial<BookBookmarkDto>,
    @CurrentUser('sub') userId: string,
  ) {
    return this.progressService.updateBookmark(userId, bookmarkId, dto);
  }

  @Delete('bookmarks/:bookmarkId')
  @ApiOperation({ summary: 'Delete a bookmark' })
  async removeBookmark(
    @Param('bookmarkId', ParseUUIDPipe) bookmarkId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.progressService.removeBookmark(userId, bookmarkId);
    return { message: 'Bookmark deleted' };
  }
}
