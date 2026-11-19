import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyService, API_TOKEN_PREFIX } from '../../modules/api-key/api-key.service';

/**
 * 用户信息 / 账号类接口：API Token 一律禁止访问。
 * 必须继续用 JWT。
 *
 * 注意：这里只列"账号身份"范畴。书签/收藏/阅读进度等个人内容
 * 接口虽带用户数据，但 API Token 注入的是 token 所属用户的 sub，
 * 天然只能读到该用户自己的数据，因此按需求"别的信息都要可以访问"放行。
 */
const TOKEN_RESTRICTED_PREFIXES = [
  '/api/auth',       // 登录、注册、刷新、/me
  '/api/admin',      // 后台用户管理
  '/api/api-keys',   // token 自身管理
];
const TOKEN_RESTRICTED_EXACT = [
  '/api/vip/profile', // VIP 身份资料
];

function isRestrictedPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (TOKEN_RESTRICTED_EXACT.includes(p)) return true;
  return TOKEN_RESTRICTED_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

function extractToken(request: Request): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader) {
    const [type, token] = authHeader.split(' ');
    if (type === 'Bearer' && token) return token;
  }
  const queryToken = request.query?.token;
  if (typeof queryToken === 'string' && queryToken) return queryToken;
  const apiKeyHeader = request.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader) return apiKeyHeader;
  return undefined;
}

/**
 * 全局 guard：只处理 bd_ 前缀的 API Token，其余请求（JWT / 匿名）直接放行，
 * 因此现有的 public 接口无 token 时行为完全不变。
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractToken(request);

    if (!token || !token.startsWith(API_TOKEN_PREFIX)) {
      return true;
    }

    const pathname = (request.originalUrl || request.url || '').split('?')[0];
    if (isRestrictedPath(pathname)) {
      throw new ForbiddenException(
        'API tokens are not allowed to access user account information',
      );
    }

    const identity = await this.apiKeyService.validateToken(token);

    // 与 JWT payload 保持同形，@CurrentUser('sub') / 'role' 等无需改动
    (request as Request & { user: unknown }).user = {
      sub: identity.userId,
      email: identity.email,
      role: identity.role,
      tokenType: 'api-key',
      apiKeyId: identity.id,
    };

    return true;
  }
}
