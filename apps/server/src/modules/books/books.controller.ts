import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  Res,
  ParseUUIDPipe,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { BooksService } from './books.service';
import {
  CreateBookDto,
  UpdateBookDto,
  BookQueryDto,
  BookResponseDto,
  PaginatedBooksDto,
  BookStatsDto,
  UploadBookDto,
  AddTagDto,
} from './dto/books.dto';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new book entry' })
  @ApiResponse({ status: 201, type: BookResponseDto })
  async create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a local book file' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({ status: 201, type: BookResponseDto })
  async uploadBook(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 500 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.booksService.createFromUpload(file);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List all books with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedBooksDto })
  async findAll(
    @Query() query: BookQueryDto,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.booksService.findAll(query, userId);
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Full-text search across books' })
  @ApiResponse({ status: 200, type: [BookResponseDto] })
  async search(
    @Query('q') query: string,
    @Query('limit') limit = 50,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.booksService.search(query, limit, userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get library statistics' })
  @ApiResponse({ status: 200, type: BookStatsDto })
  async getStats() {
    return this.booksService.getStats();
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get a single book by ID' })
  @ApiResponse({ status: 200, type: BookResponseDto })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId?: string,
  ) {
    return this.booksService.findOne(id, userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a book' })
  @ApiResponse({ status: 200, type: BookResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookDto,
  ) {
    return this.booksService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Delete a book (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.booksService.remove(id);
    return { message: 'Book deleted successfully' };
  }

  @Get(':id/cover')
  @ApiOperation({ summary: 'Get book cover image' })
  async getCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, contentType } = await this.booksService.getCover(id);
    res.set({ 'Content-Type': contentType });
    if (stream) {
      return new StreamableFile(stream as Buffer);
    }
    return res.send(stream);
  }

  @Get(':id/chapters')
  @ApiOperation({ summary: 'Get book chapters' })
  async getChapters(@Param('id', ParseUUIDPipe) id: string) {
    return this.booksService.getChapters(id);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Get chapter content' })
  async getChapterContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('chapter') chapter: string,
  ) {
    const index = parseInt(chapter || '0', 10);
    return this.booksService.getChapterContent(id, index);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download book file' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('view') view?: string,
  ) {
    const { path, filename, contentType } = await this.booksService.download(id);
    const encoded = encodeURIComponent(filename);
    // 如果带 ?view=1 参数或者是 PDF 文件，使用 inline 让浏览器直接显示
    const isInline = view === '1' || contentType === 'application/pdf';
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    });
    res.sendFile(path, { root: '/' });
  }

  @Post(':id/tags')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a tag to a book' })
  @ApiResponse({ status: 200, type: BookResponseDto })
  async addTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTagDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.booksService.addTag(id, dto.tagName, userId);
  }

  @Delete(':id/tags/:tagName')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a tag from a book' })
  @ApiResponse({ status: 200, type: BookResponseDto })
  async removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagName') tagName: string,
  ) {
    return this.booksService.removeTag(id, tagName);
  }

  @Post('sync/full')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Full sync: scan all local books, add new, remove missing, refresh metadata' })
  async fullSync() {
    const result = await this.booksService.fullSync();
    return { message: 'Full sync completed', ...result };
  }

  @Post('sync/incremental')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Incremental sync: only add new books found on disk' })
  async incrementalSync() {
    const result = await this.booksService.incrementalSync();
    return { message: 'Incremental sync completed', ...result };
  }
}
