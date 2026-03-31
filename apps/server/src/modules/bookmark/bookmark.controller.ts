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
  CreateBookmarkDto,
  UpdateBookmarkDto,
  BookmarkResponseDto,
  BookmarkQueryDto,
  CreateHighlightDto,
  UpdateHighlightDto,
  HighlightResponseDto,
  HighlightQueryDto,
} from './dto/bookmark.dto';
import { BookmarkService } from './bookmark.service';

@ApiTags('Bookmarks & Highlights')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  // ── Bookmark Endpoints ─────────────────────────────────────────────────────

  @Post('bookmarks')
  @ApiOperation({ summary: 'Create a bookmark' })
  @ApiResponse({ status: 201, type: BookmarkResponseDto })
  async createBookmark(
    @Body() dto: CreateBookmarkDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.bookmarkService.createBookmark(userId, dto);
  }

  @Get('bookmarks/:bookId')
  @ApiOperation({ summary: 'Get all bookmarks for a book' })
  @ApiResponse({ status: 200, type: [BookmarkResponseDto] })
  async getBookmarks(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @CurrentUser('sub') userId: string,
    @Query() _query: BookmarkQueryDto,
  ) {
    return this.bookmarkService.getBookmarks(userId, bookId);
  }

  @Get('bookmarks/single/:bookmarkId')
  @ApiOperation({ summary: 'Get a single bookmark' })
  @ApiResponse({ status: 200, type: BookmarkResponseDto })
  async getBookmark(
    @Param('bookmarkId', ParseUUIDPipe) bookmarkId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.bookmarkService.getBookmark(userId, bookmarkId);
  }

  @Put('bookmarks/:bookmarkId')
  @ApiOperation({ summary: 'Update a bookmark' })
  @ApiResponse({ status: 200, type: BookmarkResponseDto })
  async updateBookmark(
    @Param('bookmarkId', ParseUUIDPipe) bookmarkId: string,
    @Body() dto: UpdateBookmarkDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.bookmarkService.updateBookmark(userId, bookmarkId, dto);
  }

  @Delete('bookmarks/:bookmarkId')
  @ApiOperation({ summary: 'Delete a bookmark' })
  @ApiResponse({ status: 200 })
  async deleteBookmark(
    @Param('bookmarkId', ParseUUIDPipe) bookmarkId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.bookmarkService.deleteBookmark(userId, bookmarkId);
    return { success: true };
  }

  // ── Highlight Endpoints ────────────────────────────────────────────────────

  @Post('highlights')
  @ApiOperation({ summary: 'Create a highlight' })
  @ApiResponse({ status: 201, type: HighlightResponseDto })
  async createHighlight(
    @Body() dto: CreateHighlightDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.bookmarkService.createHighlight(userId, dto);
  }

  @Get('highlights/:bookId')
  @ApiOperation({ summary: 'Get all highlights for a book' })
  @ApiResponse({ status: 200, type: [HighlightResponseDto] })
  async getHighlights(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @CurrentUser('sub') userId: string,
    @Query() _query: HighlightQueryDto,
  ) {
    return this.bookmarkService.getHighlights(userId, bookId);
  }

  @Put('highlights/:highlightId')
  @ApiOperation({ summary: 'Update a highlight' })
  @ApiResponse({ status: 200, type: HighlightResponseDto })
  async updateHighlight(
    @Param('highlightId', ParseUUIDPipe) highlightId: string,
    @Body() dto: UpdateHighlightDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.bookmarkService.updateHighlight(userId, highlightId, dto);
  }

  @Delete('highlights/:highlightId')
  @ApiOperation({ summary: 'Delete a highlight' })
  @ApiResponse({ status: 200 })
  async deleteHighlight(
    @Param('highlightId', ParseUUIDPipe) highlightId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.bookmarkService.deleteHighlight(userId, highlightId);
    return { success: true };
  }
}
