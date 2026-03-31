import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
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
    MinLength
} from 'class-validator';

export class UserQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  preferences?: string; // JSON string

  // VIP Membership management
  @ApiPropertyOptional({ description: 'VIP level: free, year, lifetime' })
  @IsString()
  @IsOptional()
  vipLevel?: string;

  @ApiPropertyOptional({ description: 'VIP expiry date (ISO string), null = never expires' })
  @IsString()
  @IsOptional()
  vipExpiredAt?: string | null;
}

export class AdminUserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  _count?: {
    collections: number;
    readingProgress: number;
    bookmarks: number;
  };

  // VIP Membership fields
  @ApiPropertyOptional()
  vipLevel?: string;

  @ApiPropertyOptional()
  vipExpiredAt?: Date | null;
}

// ── Data Source Management ────────────────────────────────────────────────────

export class DataSourceTypeDto {
  @ApiProperty({ enum: ['webdav', 'smb', 'local', 'url'] })
  type: 'webdav' | 'smb' | 'local' | 'url';
}

export class CreateDataSourceDto {
  @ApiProperty({ example: 'My NAS Library' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: ['webdav', 'smb', 'local', 'url'] })
  @IsEnum(['webdav', 'smb', 'local', 'url'])
  type: 'webdav' | 'smb' | 'local' | 'url';

  @ApiPropertyOptional({ example: 'https://nas.example.com/dav' })
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  host?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  share?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ description: 'Local path on server' })
  @IsString()
  @IsOptional()
  localPath?: string;

  @ApiPropertyOptional({ example: '/ebooks' })
  @IsString()
  @IsOptional()
  basePath?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  autoScan?: boolean;

  @ApiPropertyOptional({ default: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @IsOptional()
  scanIntervalSecs?: number;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  formats?: string[]; // ['epub', 'pdf', 'mobi']

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class DataSourceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional()
  host?: string;

  @ApiPropertyOptional()
  share?: string;

  @ApiPropertyOptional()
  basePath?: string;

  @ApiProperty()
  autoScan: boolean;

  @ApiProperty()
  scanIntervalSecs: number;

  @ApiProperty()
  isEnabled: boolean;

  @ApiProperty()
  lastSyncAt?: Date;

  @ApiProperty()
  createdAt: Date;
}

// ── Sync Jobs ────────────────────────────────────────────────────────────────

export class TriggerSyncDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  dataSourceId?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  forceReindex?: boolean;
}

export class SyncJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  dataSourceId?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiProperty()
  stats?: {
    booksAdded: number;
    booksUpdated: number;
    booksRemoved: number;
    errors: number;
  };
}

// ── System Stats ──────────────────────────────────────────────────────────────

export class SystemStatsDto {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  activeUsers: number;

  @ApiProperty()
  totalBooks: number;

  @ApiProperty()
  totalCollections: number;

  @ApiProperty()
  totalReadingProgress: number;

  @ApiProperty()
  totalTtsJobs: number;

  @ApiProperty()
  storageUsed: {
    ebooks: bigint;
    audio: bigint;
  };

  @ApiProperty()
  queueStats: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
}
