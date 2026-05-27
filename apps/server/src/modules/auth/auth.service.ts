import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PRISMA_CLIENT } from '../../config/database.module';
import { UserRole } from '../../common/types/prisma-compat';
import { RegisterDto, LoginDto, AuthResponseDto, UserInfoDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Check if self-registration is allowed (skip for first user)
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      const config = await this.prisma.systemConfig.findUnique({
        where: { key: 'allow_register' },
      });
      if (config?.value === 'false') {
        throw new ForbiddenException('Registration is currently disabled');
      }
    }

    // Check username uniqueness
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const email = `${dto.username}@bookdock.local`;

    // First registered user becomes admin
    const role = userCount === 0 ? 'admin' : 'user';

    const user = await this.prisma.user.create({
      data: {
        email,
        username: dto.username,
        passwordHash,
        role,
      },
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateTokens(user, userAgent, ipAddress);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: {
        userId,
        refreshToken,
      },
    });
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });

      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new BadRequestException('Session expired or invalid');
      }

      // Delete old session
      await this.prisma.session.delete({ where: { id: session.id } });

      return this.generateTokens(session.user, session.userAgent || undefined, session.ipAddress?.toString());
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getCurrentUser(userId: string): Promise<UserInfoDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.toUserInfo(user);
  }

  private async generateTokens(
    user: User,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    const jwtSecret = this.configService.get<string>('app.jwtSecret');
    const jwtExpiry = this.configService.get<string>('app.jwtExpiry') || '7d';
    const refreshExpiry = this.configService.get<string>('app.jwtRefreshExpiry') || '30d';

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
      },
      { secret: jwtSecret, expiresIn: jwtExpiry },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        type: 'refresh',
      },
      { secret: jwtSecret, expiresIn: refreshExpiry },
    );

    const expiresAt = new Date();
    const days = refreshExpiry.includes('d') ? parseInt(refreshExpiry) : 30;
    expiresAt.setDate(expiresAt.getDate() + days);

    // Store session
    await this.prisma.session.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        refreshToken,
        userAgent,
        ipAddress: ipAddress ? (ipAddress as any) : undefined,
        expiresAt,
      },
    });

    return {
      token: accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 3600, // 7 days in seconds
      user: this.toUserInfo(user),
    };
  }

  private toUserInfo(user: User): UserInfoDto {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName || undefined,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl || undefined,
      membership: 'free',
      createdAt: user.createdAt,
    };
  }

  // ─── Phone + SMS Auth (placeholder implementation) ───────────────────────

  async sendSmsCode(phone: string): Promise<{ message: string; expiresIn?: number }> {
    // TODO: Integrate with SMS provider (e.g. Aliyun SMS, Twilio)
    return { message: `SMS code sent to ${phone}`, expiresIn: 300 };
  }

  async loginWithPhone(
    dto: { phone: string; code: string },
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    // TODO: Verify SMS code
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (!user) {
      throw new UnauthorizedException('Phone not registered');
    }
    return this.generateTokens(user, userAgent, ipAddress);
  }

  async registerWithPhone(
    dto: { phone: string; code: string; username?: string },
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponseDto> {
    // TODO: Verify SMS code
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('Phone already registered');
    }

    const username = dto.username || dto.phone;

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        username,
        email: `${dto.phone}@phone.local`,
        passwordHash: await bcrypt.hash(dto.phone + dto.code, 12),
        role: 'user',
      },
    });

    return this.generateTokens(user, userAgent, ipAddress);
  }
}
