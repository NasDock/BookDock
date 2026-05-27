import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
  UserQueryDto,
  CreateUserDto,
  UpdateUserDto,
  AdminUserResponseDto,
  CreateDataSourceDto,
  DataSourceResponseDto,
  TriggerSyncDto,
  SyncJobResponseDto,
  SystemStatsDto,
} from './dto/admin.dto';
import { readFile } from 'fs/promises';

@Injectable()
export class AdminService {
  private readonly dataSourcesPath: string;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    this.dataSourcesPath = join(process.cwd(), 'data', 'datasources.json');
  }

  // ── User Management ────────────────────────────────────────────────────────

  async listUsers(query: UserQueryDto): Promise<{ data: AdminUserResponseDto[]; total: number }> {
    const { page = 1, limit = 20, search, role } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { displayName: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { collections: true, readingProgress: true, bookmarks: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.toAdminUser(u)),
      total,
    };
  }

  async createUser(dto: CreateUserDto): Promise<AdminUserResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const email = `${dto.username}@bookdock.local`;

    const user = await this.prisma.user.create({
      data: {
        email,
        username: dto.username,
        passwordHash,
        displayName: dto.displayName || dto.username,
        role: dto.role || 'user',
      },
      include: {
        _count: { select: { collections: true, readingProgress: true, bookmarks: true } },
      },
    });

    return this.toAdminUser(user);
  }

  async getUser(userId: string): Promise<AdminUserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { collections: true, readingProgress: true, bookmarks: true } },
      },
    });

    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return this.toAdminUser(user);
  }

  async updateUser(
    adminId: string,
    targetUserId: string,
    dto: UpdateUserDto,
  ): Promise<AdminUserResponseDto> {
    // Prevent self-demotion from admin
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (adminId === targetUserId && dto.role && dto.role !== 'admin') {
      throw new ForbiddenException('Cannot demote yourself from admin');
    }

    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(dto.displayName && { displayName: dto.displayName }),
        ...(dto.avatarUrl && { avatarUrl: dto.avatarUrl }),
        ...(dto.role && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        _count: { select: { collections: true, readingProgress: true, bookmarks: true } },
      },
    });

    return this.toAdminUser(user);
  }

  async deleteUser(adminId: string, targetUserId: string): Promise<void> {
    if (adminId === targetUserId) {
      throw new ForbiddenException('Cannot delete yourself');
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException(`User ${targetUserId} not found`);
    if (user.role === 'admin') {
      throw new ForbiddenException('Cannot delete another admin');
    }

    await this.prisma.user.delete({ where: { id: targetUserId } });
  }

  // ── Data Source Management ─────────────────────────────────────────────────

  async listDataSources(): Promise<DataSourceResponseDto[]> {
    const sources = this.loadDataSources();
    return sources;
  }

  async createDataSource(dto: CreateDataSourceDto): Promise<DataSourceResponseDto> {
    const sources = this.loadDataSources();
    const newSource = {
      id: `ds_${Date.now()}`,
      ...dto,
      isEnabled: dto.isEnabled ?? true,
      autoScan: dto.autoScan ?? false,
      scanIntervalSecs: dto.scanIntervalSecs ?? 300,
      formats: dto.formats ?? ['epub', 'pdf', 'mobi', 'txt'],
      lastSyncAt: undefined,
      createdAt: new Date(),
      // Don't store plain passwords - hash in production
      password: dto.password || undefined,
    };

    sources.push(newSource as DataSourceResponseDto & { password?: string });
    this.saveDataSources(sources);

    const { password: _, ...safeSource } = newSource;
    return safeSource as DataSourceResponseDto;
  }

  async updateDataSource(
    sourceId: string,
    dto: Partial<CreateDataSourceDto>,
  ): Promise<DataSourceResponseDto> {
    const sources = this.loadDataSources();
    const idx = sources.findIndex((s) => s.id === sourceId);
    if (idx === -1) throw new NotFoundException(`Data source ${sourceId} not found`);

    const updated = { ...sources[idx], ...dto };
    sources[idx] = updated;
    this.saveDataSources(sources);

    const { password: _, ...safe } = updated as typeof updated & { password?: string };
    return safe as DataSourceResponseDto;
  }

  async deleteDataSource(sourceId: string): Promise<void> {
    const sources = this.loadDataSources();
    const filtered = sources.filter((s) => s.id !== sourceId);
    if (filtered.length === sources.length) {
      throw new NotFoundException(`Data source ${sourceId} not found`);
    }
    this.saveDataSources(filtered);
  }

  // ── Sync Jobs ──────────────────────────────────────────────────────────────

  async triggerSync(dto: TriggerSyncDto): Promise<SyncJobResponseDto> {
    return {
      id: String(Date.now()),
      dataSourceId: dto.dataSourceId,
      status: 'pending',
      createdAt: new Date(),
    };
  }

  async listSyncJobs(limit = 50): Promise<SyncJobResponseDto[]> {
    const jobs = await this.prisma.indexerJob.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((j) => ({
      id: j.id,
      status: j.status,
      createdAt: j.createdAt,
      completedAt: j.processedAt || undefined,
      stats: j.error ? { booksAdded: 0, booksUpdated: 0, booksRemoved: 0, errors: 1 } : undefined,
    }));
  }

  // ── System Stats ────────────────────────────────────────────────────────────

  async getSystemStats(): Promise<SystemStatsDto> {
    const [
      totalUsers,
      activeUsers,
      totalBooks,
      totalCollections,
      totalProgress,
      totalTtsJobs,
      storageBooks,
      storageAudio,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.book.count({ where: { isDeleted: false } }),
      this.prisma.collection.count(),
      this.prisma.readingProgress.count(),
      this.prisma.ttsJob.count(),
      this.prisma.book.aggregate({ _sum: { fileSize: true } }),
      // Approximate - would need actual audio table scan in production
      this.prisma.ttsAudioFile.aggregate({ _sum: { fileSize: true } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      totalBooks,
      totalCollections,
      totalReadingProgress: totalProgress,
      totalTtsJobs,
      storageUsed: {
        ebooks: storageBooks._sum.fileSize || BigInt(0),
        audio: storageAudio._sum.fileSize || BigInt(0),
      },
      queueStats: {
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
      },
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private loadDataSources(): (DataSourceResponseDto & { password?: string })[] {
    try {
      if (existsSync(this.dataSourcesPath)) {
        const content = readFileSync(this.dataSourcesPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveDataSources(sources: unknown[]): void {
    try {
      const dir = this.dataSourcesPath.substring(0, this.dataSourcesPath.lastIndexOf('/'));
      if (!existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
      writeFileSync(this.dataSourcesPath, JSON.stringify(sources, null, 2));
    } catch {
      // ignore
    }
  }

  private toAdminUser(u: any): AdminUserResponseDto {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName || undefined,
      role: u.role,
      avatarUrl: u.avatarUrl || undefined,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt || undefined,
      createdAt: u.createdAt,
      _count: u._count,
    };
  }

  // ── System Config ──────────────────────────────────────────────────────────

  async getSystemConfig(key: string): Promise<string | null> {
    const config = await this.prisma.systemConfig.findUnique({ where: { key } });
    return config?.value ?? null;
  }

  async setSystemConfig(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
