import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BookLastReadService } from './book-last-read.service';
import {
    BookLastReadResponseDto,
    SaveBookLastReadDto,
} from './dto/book-last-read.dto';

@ApiTags('Book Last Read')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('books/:bookId/last-read')
export class BookLastReadController {
  constructor(private readonly service: BookLastReadService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Upsert the global "last listened" pointer for (user, book)' })
  async save(
    @Body() dto: SaveBookLastReadDto,
    @CurrentUser('sub') userId: string,
  ): Promise<BookLastReadResponseDto> {
    return this.service.save(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get the global "last listened" pointer for (user, book)' })
  async get(
    @Param('bookId') bookId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<BookLastReadResponseDto | null> {
    return this.service.get(userId, bookId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete the global "last listened" pointer for (user, book)' })
  async remove(
    @Param('bookId') bookId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    await this.service.delete(userId, bookId);
  }
}