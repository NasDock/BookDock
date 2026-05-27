import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Collections')
@Controller('collections')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @ApiOperation({ summary: 'Get my collections' })
  async getCollections(@CurrentUser('sub') userId: string) {
    return this.collectionService.getCollections(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get collection detail with books' })
  async getCollection(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.collectionService.getCollection(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a collection' })
  async createCollection(
    @CurrentUser('sub') userId: string,
    @Body() dto: { name: string; description?: string },
  ) {
    return this.collectionService.createCollection(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a collection' })
  async updateCollection(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { name?: string; description?: string },
  ) {
    return this.collectionService.updateCollection(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a collection' })
  async deleteCollection(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.collectionService.deleteCollection(userId, id);
  }

  @Post(':id/books')
  @ApiOperation({ summary: 'Add book to collection' })
  async addBook(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { bookId: string },
  ) {
    return this.collectionService.addBook(userId, id, dto.bookId);
  }

  @Delete(':id/books/:bookId')
  @ApiOperation({ summary: 'Remove book from collection' })
  async removeBook(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
  ) {
    return this.collectionService.removeBook(userId, id, bookId);
  }
}
