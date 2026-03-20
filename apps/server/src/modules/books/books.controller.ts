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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
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

  @Get()
  @ApiOperation({ summary: 'List all books with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedBooksDto })
  async findAll(@Query() query: BookQueryDto) {
    return this.booksService.findAll(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search across books' })
  @ApiResponse({ status: 200, type: [BookResponseDto] })
  async search(@Query('q') query: string, @Query('limit') limit = 50) {
    return this.booksService.search(query, limit);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get library statistics' })
  @ApiResponse({ status: 200, type: BookStatsDto })
  async getStats() {
    return this.booksService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single book by ID' })
  @ApiResponse({ status: 200, type: BookResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.booksService.findOne(id);
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

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download book file' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { path, filename, contentType } = await this.booksService.download(id);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return res.download(path);
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
}
