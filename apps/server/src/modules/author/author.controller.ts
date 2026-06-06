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
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthorService } from './author.service';
import { CreateAuthorDto, UpdateAuthorDto } from './dto/author.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Authors')
@Controller('authors')
export class AuthorController {
  constructor(private readonly authorService: AuthorService) {}

  @Get()
  @ApiOperation({ summary: 'List authors' })
  async getAuthors(@Query('search') search?: string) {
    const data = await this.authorService.getAuthors(search);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get author detail' })
  async getAuthor(@Param('id', ParseUUIDPipe) id: string) {
    return await this.authorService.getAuthor(id);
  }

  @Get(':id/books')
  @ApiOperation({ summary: 'Get books by author' })
  async getAuthorBooks(@Param('id', ParseUUIDPipe) id: string) {
    return await this.authorService.getAuthorBooks(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create author' })
  async createAuthor(@Body() dto: CreateAuthorDto) {
    const data = await this.authorService.createAuthor(dto);
    return { success: true, data };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update author' })
  async updateAuthor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAuthorDto,
  ) {
    const data = await this.authorService.updateAuthor(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete author' })
  async deleteAuthor(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.authorService.deleteAuthor(id);
    return { success: true, data };
  }
}
