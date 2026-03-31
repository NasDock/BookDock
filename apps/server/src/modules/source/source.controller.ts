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
    Res,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { SourceService } from './source.service';
import {
    CreateSourceDto,
    UpdateSourceDto,
    SourceResponseDto,
    SourceFileItemDto,
    SyncResultDto,
    ConnectionTestResultDto,
} from './dto/source.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Sources')
@Controller('sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SourceController {
    constructor(private readonly sourceService: SourceService) {}

    /**
     * Create a new ebook source
     */
    @Post()
    @UseGuards(RolesGuard)
    @Roles('admin')
    @ApiOperation({ summary: 'Add a new ebook source (NAS/remote library)' })
    @ApiResponse({ status: 201, type: SourceResponseDto })
    async create(@Body() dto: CreateSourceDto) {
        return this.sourceService.create(dto);
    }

    /**
     * List all ebook sources
     */
    @Get()
    @ApiOperation({ summary: 'List all configured ebook sources' })
    @ApiResponse({ status: 200, type: [SourceResponseDto] })
    async findAll() {
        return this.sourceService.findAll();
    }

    /**
     * Get a single source by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a source by ID' })
    @ApiResponse({ status: 200, type: SourceResponseDto })
    async findOne(@Param('id') id: string) {
        return this.sourceService.findOne(id);
    }

    /**
     * Update a source
     */
    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles('admin')
    @ApiOperation({ summary: 'Update a source configuration' })
    @ApiResponse({ status: 200, type: SourceResponseDto })
    async update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
        return this.sourceService.update(id, dto);
    }

    /**
     * Delete a source
     */
    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles('admin')
    @ApiOperation({ summary: 'Delete a source' })
    @ApiResponse({ status: 200 })
    @HttpCode(HttpStatus.OK)
    async remove(@Param('id') id: string) {
        await this.sourceService.remove(id);
        return { message: 'Source deleted successfully' };
    }

    /**
     * Test connection to a source
     */
    @Post(':id/test')
    @ApiOperation({ summary: 'Test connection to a source' })
    @ApiResponse({ status: 200, type: ConnectionTestResultDto })
    @HttpCode(HttpStatus.OK)
    async testConnection(@Param('id') id: string) {
        return this.sourceService.testConnection(id);
    }

    /**
     * Test connection with provided config (without saving)
     */
    @Post('test-config')
    @ApiOperation({ summary: 'Test connection with a config (without saving)' })
    @ApiResponse({ status: 200, type: ConnectionTestResultDto })
    @HttpCode(HttpStatus.OK)
    async testConnectionConfig(@Body() dto: CreateSourceDto) {
        return this.sourceService.testConnectionByConfig(dto);
    }

    /**
     * List files in a source directory
     */
    @Get(':id/files')
    @ApiOperation({ summary: 'List files in a source directory' })
    @ApiQuery({ name: 'path', required: false, description: 'Directory path within the source', example: '/ebooks' })
    @ApiResponse({ status: 200, type: [SourceFileItemDto] })
    async listFiles(
        @Param('id') id: string,
        @Query('path') path: string = '/',
    ) {
        return this.sourceService.listFiles(id, path);
    }

    /**
     * Download a file from a source
     */
    @Get(':id/download')
    @ApiOperation({ summary: 'Download a file from a source' })
    @ApiResponse({ status: 200, description: 'File binary content' })
    async downloadFile(
        @Param('id') id: string,
        @Query('path') path: string,
        @Res() res: Response,
    ) {
        if (!path) {
            return res.status(400).json({ error: 'path query parameter is required' });
        }

        const data = await this.sourceService.downloadFile(id, path);
        const filename = path.split('/').pop() || 'file';

        res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': data.length,
        });

        return res.send(data);
    }

    /**
     * Sync books from a source
     */
    @Get(':id/sync')
    @ApiOperation({ summary: 'Sync books from a source to the library' })
    @ApiResponse({ status: 200, type: SyncResultDto })
    async sync(@Param('id') id: string) {
        return this.sourceService.sync(id);
    }

    /**
     * Trigger sync (alternative POST endpoint)
     */
    @Post(':id/sync')
    @ApiOperation({ summary: 'Trigger sync from a source' })
    @ApiResponse({ status: 200, type: SyncResultDto })
    @HttpCode(HttpStatus.OK)
    async triggerSync(@Param('id') id: string) {
        return this.sourceService.sync(id);
    }
}
