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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  UserQueryDto,
  UpdateUserDto,
  AdminUserResponseDto,
  CreateDataSourceDto,
  DataSourceResponseDto,
  TriggerSyncDto,
  SyncJobResponseDto,
  SystemStatsDto,
} from './dto/admin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Users ───────────────────────────────────────────────────────────────────

  @Get('users')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiResponse({ status: 200 })
  async listUsers(@Query() query: UserQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:userId')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Get user details (admin only)' })
  @ApiResponse({ status: 200, type: AdminUserResponseDto })
  async getUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminService.getUser(userId);
  }

  @Put('users/:userId')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Update user (admin only)' })
  @ApiResponse({ status: 200, type: AdminUserResponseDto })
  async updateUser(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminService.updateUser(adminId, targetUserId, dto);
  }

  @Delete('users/:userId')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Delete user (admin only)' })
  async deleteUser(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('sub') adminId: string,
  ) {
    await this.adminService.deleteUser(adminId, targetUserId);
    return { message: 'User deleted successfully' };
  }

  // ── Data Sources ─────────────────────────────────────────────────────────────

  @Get('data-sources')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'List ebook data sources' })
  @ApiResponse({ status: 200, type: [DataSourceResponseDto] })
  async listDataSources() {
    return this.adminService.listDataSources();
  }

  @Post('data-sources')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Create a new data source' })
  @ApiResponse({ status: 201, type: DataSourceResponseDto })
  async createDataSource(@Body() dto: CreateDataSourceDto) {
    return this.adminService.createDataSource(dto);
  }

  @Put('data-sources/:sourceId')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Update a data source' })
  @ApiResponse({ status: 200, type: DataSourceResponseDto })
  async updateDataSource(
    @Param('sourceId') sourceId: string,
    @Body() dto: Partial<CreateDataSourceDto>,
  ) {
    return this.adminService.updateDataSource(sourceId, dto);
  }

  @Delete('data-sources/:sourceId')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Delete a data source' })
  async deleteDataSource(@Param('sourceId') sourceId: string) {
    await this.adminService.deleteDataSource(sourceId);
    return { message: 'Data source deleted' };
  }

  // ── Sync Jobs ────────────────────────────────────────────────────────────────

  @Post('sync')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Trigger a manual data sync' })
  @ApiResponse({ status: 200, type: SyncJobResponseDto })
  async triggerSync(@Body() dto: TriggerSyncDto) {
    return this.adminService.triggerSync(dto);
  }

  @Get('sync-jobs')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'List sync/indexer jobs' })
  @ApiResponse({ status: 200, type: [SyncJobResponseDto] })
  async listSyncJobs(@Query('limit') limit = 50) {
    return this.adminService.listSyncJobs(limit);
  }

  // ── System Stats ─────────────────────────────────────────────────────────────

  @Get('stats')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Get system statistics' })
  @ApiResponse({ status: 200, type: SystemStatsDto })
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }
}
