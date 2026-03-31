import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
    IsObject,
} from 'class-validator';

export type SourceType = 'webdav' | 'smb' | 'ftp';

// ─── WebDAV Config ───────────────────────────────────────────────────────────

export class WebDAVConfigDto {
    @ApiProperty({ example: 'https://nas.example.com/dav' })
    @IsString()
    url: string;

    @ApiPropertyOptional({ example: 'admin' })
    @IsString()
    @IsOptional()
    username?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    password?: string;

    @ApiPropertyOptional({ description: 'Ignore SSL certificate errors', default: false })
    @IsBoolean()
    @IsOptional()
    rejectUnauthorized?: boolean;

    @ApiPropertyOptional({ example: '/ebooks' })
    @IsString()
    @IsOptional()
    basePath?: string;
}

// ─── SMB Config ──────────────────────────────────────────────────────────────

export class SMBConfigDto {
    @ApiProperty({ example: 'smb://192.168.1.100/library' })
    @IsString()
    share: string;

    @ApiPropertyOptional({ example: 'admin' })
    @IsString()
    @IsOptional()
    username?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    password?: string;

    @ApiPropertyOptional({ example: 'WORKGROUP' })
    @IsString()
    @IsOptional()
    domain?: string;

    @ApiPropertyOptional({ example: 445 })
    @IsInt()
    @IsOptional()
    port?: number;

    @ApiPropertyOptional({ example: '/ebooks' })
    @IsString()
    @IsOptional()
    basePath?: string;
}

// ─── FTP Config ──────────────────────────────────────────────────────────────

export class FTPConfigDto {
    @ApiProperty({ example: '192.168.1.100' })
    @IsString()
    host: string;

    @ApiPropertyOptional({ example: 21 })
    @IsInt()
    @IsOptional()
    port?: number;

    @ApiPropertyOptional({ example: 'ftpuser' })
    @IsString()
    @IsOptional()
    username?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    password?: string;

    @ApiPropertyOptional({ description: 'Use FTPS (TLS)', default: false })
    @IsBoolean()
    @IsOptional()
    secure?: boolean;

    @ApiPropertyOptional({ description: 'Reject unauthorized SSL certs', default: false })
    @IsBoolean()
    @IsOptional()
    rejectUnauthorized?: boolean;

    @ApiPropertyOptional({ example: '/ebooks' })
    @IsString()
    @IsOptional()
    basePath?: string;
}

// ─── Create Source DTO ───────────────────────────────────────────────────────

export class CreateSourceDto {
    @ApiProperty({ example: 'My NAS Library' })
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    name: string;

    @ApiProperty({ enum: ['webdav', 'smb', 'ftp'] })
    @IsEnum(['webdav', 'smb', 'ftp'])
    type: SourceType;

    @ApiPropertyOptional({ description: 'WebDAV connection config' })
    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => Object)
    webdavConfig?: WebDAVConfigDto;

    @ApiPropertyOptional({ description: 'SMB connection config' })
    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => Object)
    smbConfig?: SMBConfigDto;

    @ApiPropertyOptional({ description: 'FTP connection config' })
    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => Object)
    ftpConfig?: FTPConfigDto;

    @ApiPropertyOptional({ description: 'Auto-scan for new books', default: true })
    @IsBoolean()
    @IsOptional()
    autoSync?: boolean;

    @ApiPropertyOptional({ description: 'Sync interval in seconds', default: 3600 })
    @IsInt()
    @Min(300)
    @IsOptional()
    syncIntervalSecs?: number;

    @ApiPropertyOptional({ description: 'Supported file formats', default: ['epub', 'pdf', 'mobi', 'txt'] })
    @IsArray()
    @IsOptional()
    formats?: string[];
}

// ─── Update Source DTO ───────────────────────────────────────────────────────

export class UpdateSourceDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    enabled?: boolean;

    @ApiPropertyOptional({ description: 'WebDAV connection config' })
    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => Object)
    webdavConfig?: WebDAVConfigDto;

    @ApiPropertyOptional({ description: 'SMB connection config' })
    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => Object)
    smbConfig?: SMBConfigDto;

    @ApiPropertyOptional({ description: 'FTP connection config' })
    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => Object)
    ftpConfig?: FTPConfigDto;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    autoSync?: boolean;

    @ApiPropertyOptional()
    @IsInt()
    @Min(300)
    @IsOptional()
    syncIntervalSecs?: number;

    @ApiPropertyOptional()
    @IsArray()
    @IsOptional()
    formats?: string[];
}

// ─── Source Response DTO ─────────────────────────────────────────────────────

export class SourceResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty({ enum: ['webdav', 'smb', 'ftp'] })
    type: SourceType;

    @ApiPropertyOptional()
    url?: string;        // WebDAV URL or SMB share

    @ApiPropertyOptional()
    host?: string;        // FTP host

    @ApiPropertyOptional()
    basePath?: string;

    @ApiPropertyOptional()
    username?: string;

    @ApiProperty()
    enabled: boolean;

    @ApiProperty()
    autoSync: boolean;

    @ApiProperty()
    syncIntervalSecs: number;

    @ApiProperty()
    formats: string[];

    @ApiPropertyOptional()
    lastSyncAt?: Date;

    @ApiPropertyOptional()
    lastError?: string;

    @ApiProperty()
    bookCount: number;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

// ─── File Item DTO ───────────────────────────────────────────────────────────

export class SourceFileItemDto {
    @ApiProperty()
    path: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    size: number;

    @ApiProperty()
    lastModified: Date;

    @ApiProperty()
    isDirectory: boolean;
}

// ─── Sync Result DTO ────────────────────────────────────────────────────────

export class SyncResultDto {
    @ApiProperty()
    sourceId: string;

    @ApiProperty()
    status: 'success' | 'partial' | 'failed';

    @ApiProperty()
    booksAdded: number;

    @ApiProperty()
    booksUpdated: number;

    @ApiProperty()
    booksFailed: number;

    @ApiPropertyOptional()
    errors?: string[];

    @ApiProperty()
    syncedAt: Date;
}

// ─── Connection Test Result ──────────────────────────────────────────────────

export class ConnectionTestResultDto {
    @ApiProperty()
    success: boolean;

    @ApiPropertyOptional()
    message?: string;

    @ApiPropertyOptional()
    serverInfo?: string;

    @ApiPropertyOptional()
    error?: string;
}
