import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PRISMA_CLIENT } from '../../config/database.module';
import { AuthResponseDto, LoginDto, RegisterDto, UserInfoDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // Check email uniqueness
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    // Check username uniqueness
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        displayName: dto.displayName,
        role: dto.role || UserRole.user,
      },
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
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
        role: user.role,
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
      accessToken,
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
      role: user.role,
      avatarUrl: user.avatarUrl || undefined,
      createdAt: user.createdAt,
    };
  }
}
