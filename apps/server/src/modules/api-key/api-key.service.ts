import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
  CreateApiKeyDto,
  UpdateApiKeyDto,
} from './dto/api-key.dto';

/** Token 明文前缀，用于与 JWT 区分 */
export const API_TOKEN_PREFIX = 'bd_';
const TOKEN_BYTES = 32;
/** lastUsedAt 写库节流间隔：60 秒 */
const LAST_USED_THROTTLE_MS = 60_000;

const lastUsedThrottle = new Map<string, number>();

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toResponse(key: {
  id: string;
  name: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
  };
}

@Injectable()
export class ApiKeyService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async list(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(toResponse);
  }

  async create(userId: string, dto: CreateApiKeyDto) {
    const token = `${API_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('hex')}`;
    const keyHash = hashToken(token);
    const expiresInDays = dto.expiresInDays ?? 0;
    const expiresAt = expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const key = await this.prisma.apiKey.create({
      data: { userId, name: dto.name, keyHash, expiresAt },
    });

    // 明文只在创建时返回一次，之后库里只有 sha256
    return { ...toResponse(key), token };
  }

  async update(userId: string, id: string, dto: UpdateApiKeyDto) {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('API token not found');

    const data: {
      name?: string;
      isActive?: boolean;
      expiresAt?: Date | null;
    } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.expiresInDays !== undefined && dto.expiresInDays !== null) {
      data.expiresAt = dto.expiresInDays > 0
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
    }

    const key = await this.prisma.apiKey.update({
      where: { id },
      data,
    });
    return toResponse(key);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('API token not found');

    await this.prisma.apiKey.delete({ where: { id } });
    lastUsedThrottle.delete(existing.keyHash);
    return { id };
  }

  /**
   * 校验 API token，返回其所属用户身份。失败直接抛 401。
   * 供全局 ApiTokenGuard 调用。
   */
  async validateToken(token: string): Promise<{
    id: string;
    userId: string;
    role: string;
    email: string;
  }> {
    if (!token.startsWith(API_TOKEN_PREFIX)) {
      throw new UnauthorizedException('Invalid API token');
    }

    const keyHash = hashToken(token);
    const key = await this.prisma.apiKey.findFirst({
      where: { keyHash },
      include: { user: true },
    });
    if (!key) throw new UnauthorizedException('Invalid API token');

    if (!key.isActive) {
      throw new UnauthorizedException('API token is disabled');
    }
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('API token has expired');
    }
    if (!key.user.isActive) {
      throw new UnauthorizedException('API token owner is inactive');
    }

    // 节流更新 lastUsedAt，避免每次请求都写库
    const last = lastUsedThrottle.get(keyHash) ?? 0;
    if (Date.now() - last > LAST_USED_THROTTLE_MS) {
      lastUsedThrottle.set(keyHash, Date.now());
      void this.prisma.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }

    return {
      id: key.id,
      userId: key.userId,
      role: key.user.role,
      email: key.user.email,
    };
  }
}
