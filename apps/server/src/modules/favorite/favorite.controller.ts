import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FavoriteService } from './favorite.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Favorites')
@Controller('favorites')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Get()
  @ApiOperation({ summary: 'Get my favorite books' })
  async getFavorites(@CurrentUser('sub') userId: string) {
    return this.favoriteService.getFavorites(userId);
  }

  @Get('check/:bookId')
  @ApiOperation({ summary: 'Check if book is favorited' })
  async checkFavorite(
    @CurrentUser('sub') userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
  ) {
    return this.favoriteService.checkFavorite(userId, bookId);
  }

  @Post()
  @ApiOperation({ summary: 'Add book to favorites' })
  async addFavorite(
    @CurrentUser('sub') userId: string,
    @Body() dto: { bookId: string },
  ) {
    return this.favoriteService.addFavorite(userId, dto.bookId);
  }

  @Delete(':bookId')
  @ApiOperation({ summary: 'Remove book from favorites' })
  async removeFavorite(
    @CurrentUser('sub') userId: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
  ) {
    return this.favoriteService.removeFavorite(userId, bookId);
  }
}
