import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiKeyService } from './api-key.service';
import {
  ApiKeyResponseDto,
  CreateApiKeyDto,
  CreatedApiKeyResponseDto,
  UpdateApiKeyDto,
} from './dto/api-key.dto';

/**
 * API Token 管理。
 * 这类接口只允许 JWT 操作 —— token 自身不能用来管理 token，
 * 全局 ApiTokenGuard 也会把 /api-keys 列入禁止路径。
 */
@ApiTags('API Tokens')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @ApiOperation({ summary: 'List my API tokens' })
  async list(@CurrentUser('sub') userId: string): Promise<ApiKeyResponseDto[]> {
    return this.apiKeyService.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an API token (plaintext returned once)' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyResponseDto> {
    return this.apiKeyService.create(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Rename / enable / disable / re-expire a token' })
  async update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeyService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an API token' })
  async remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.apiKeyService.remove(userId, id);
  }
}
