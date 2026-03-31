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
import { AuthResponseDto, LoginDto, RegisterDto, UserInfoDto, LoginWithPhoneDto, RegisterWithPhoneDto, SmsCodeResponseDto } from './dto/auth.dto';

// In-memory SMS code store (use Redis in production)
const smsCodeStore = new Map<string, { code: string; expiresAt: Date }>();
const SMS_CODE_VALIDITY_SECONDS = 5 * 60; // 5 minutes

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateTokens(user, userAgent, ipAddress);
  }

  async sendSmsCode(phone: string): Promise<SmsCodeResponseDto> {
    // Normalize phone: remove spaces, dashes
    const normalizedPhone = phone.replace(/[\s-]/g, '');

    // In production, call SMS provider (e.g., Twilio, Alibaba Cloud, Tencent Cloud)
    // For demo, generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + SMS_CODE_VALIDITY_SECONDS * 1000);

    // Store code
    smsCodeStore.set(normalizedPhone, { code, expiresAt });

    // Clean up expired codes periodically
    if (smsCodeStore.size > 1000) {
      const now = Date.now();
      for (const [key, val] of smsCodeStore.entries()) {
        if (val.expiresAt.getTime() < now) smsCodeStore.delete(key);
      }
    }

    console.log(`[SMS Mock] Sending code ${code} to ${normalizedPhone}`);

    return {
      message: `验证码已发送至 ${normalizedPhone}`,
      expiresIn: SMS_CODE_VALIDITY_SECONDS,
    };
  }

  async loginWithPhone(dto: LoginWithPhoneDto, userAgent?: string, ipAddress?: string): Promise<AuthResponseDto> {
    const normalizedPhone = dto.phone.replace(/[\s-]/g, '');

    const record = smsCodeStore.get(normalizedPhone);
    if (!record) {
      throw new UnauthorizedException('请先获取验证码');
    }
    if (record.expiresAt < new Date()) {
      smsCodeStore.delete(normalizedPhone);
      throw new UnauthorizedException('验证码已过期，请重新获取');
    }
    if (record.code !== dto.code) {
      throw new UnauthorizedException('验证码错误');
    }

    // Delete used code
    smsCodeStore.delete(normalizedPhone);

    // Find user by phone
    // Find VipMember by phone, then get corresponding User
    const vipMember = await this.prisma.vipMember.findUnique({
      where: { phone: normalizedPhone },
      include: { user: true },
    });
    let user = vipMember?.user;
    if (!user) {
      // For demo: create a new user with this phone
      const tempUsername = `user_${normalizedPhone.slice(-8)}`;
      user = await this.prisma.user.create({
        data: {
          email: `${tempUsername}@bookdock.local`,
          username: tempUsername,
          passwordHash: bcrypt.hashSync(uuidv4(), 10), // random password
          phone: normalizedPhone,
          role: UserRole.user,
        } as any,
      });
      // Create VipMember record for this user
      await this.prisma.vipMember.create({
        data: {
          userId: user.id,
          phone: normalizedPhone,
          level: 'free',
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('账户已被禁用');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateTokens(user, userAgent, ipAddress);
  }

  async registerWithPhone(dto: RegisterWithPhoneDto, userAgent?: string, ipAddress?: string): Promise<AuthResponseDto> {
    const normalizedPhone = dto.phone.replace(/[\s-]/g, '');

    const record = smsCodeStore.get(normalizedPhone);
    if (!record) {
      throw new UnauthorizedException('请先获取验证码');
    }
    if (record.expiresAt < new Date()) {
      smsCodeStore.delete(normalizedPhone);
      throw new UnauthorizedException('验证码已过期，请重新获取');
    }
    if (record.code !== dto.code) {
      throw new UnauthorizedException('验证码错误');
    }

    smsCodeStore.delete(normalizedPhone);

    // Check if phone already registered in VipMember
    const existingByPhone = await this.prisma.vipMember.findUnique({
      where: { phone: normalizedPhone },
    });
    if (existingByPhone) {
      throw new ConflictException('该手机号已注册，请直接登录');
    }

    // Check username uniqueness
    if (dto.username) {
      const existingUsername = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (existingUsername) {
        throw new ConflictException('用户名已被占用');
      }
    }

    const tempUsername = dto.username || `user_${normalizedPhone.slice(-8)}`;

    const user = await this.prisma.user.create({
      data: {
        email: `${tempUsername}@bookdock.local`,
        username: tempUsername,
        passwordHash: bcrypt.hashSync(uuidv4(), 10),
        phone: normalizedPhone,
        role: UserRole.user,
      } as any,
    });

    // Create VipMember record for this user
    await this.prisma.vipMember.create({
      data: {
        userId: user.id,
        phone: normalizedPhone,
        level: 'free',
      },
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
      expiresIn: 7 * 24 * 3600,
      user: this.toUserInfo(user),
    };
  }

  private toUserInfo(user: any): UserInfoDto {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      phone: user.phone || undefined,
      displayName: user.displayName || undefined,
      role: user.role,
      avatarUrl: user.avatarUrl || undefined,
      createdAt: user.createdAt,
    };
  }
}
