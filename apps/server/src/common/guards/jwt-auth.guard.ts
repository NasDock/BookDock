import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });
      (request as Request & { user: unknown }).user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractTokenFromRequest(request: Request): string | undefined {
    // 1. 从 Authorization header 提取
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) return token;
    }
    // 2. 从 query 参数 ?token= 提取（用于 iframe/pdf 等无法设置 header 的场景）
    const queryToken = request.query?.token;
    if (typeof queryToken === 'string' && queryToken) {
      return queryToken;
    }
    return undefined;
  }
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromRequest(request);

    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync(token, {
          secret: this.configService.get<string>('app.jwtSecret'),
        });
        (request as Request & { user: unknown }).user = payload;
      } catch {
        // Ignore validation errors for optional JWT auth
      }
    }

    return true;
  }

  private extractTokenFromRequest(request: Request): string | undefined {
    // 1. 从 Authorization header 提取
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) return token;
    }
    // 2. 从 query 参数 ?token= 提取
    const queryToken = request.query?.token;
    if (typeof queryToken === 'string' && queryToken) {
      return queryToken;
    }
    return undefined;
  }
}

