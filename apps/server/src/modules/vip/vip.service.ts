import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
  SendCodeDto,
  VipLoginDto,
  VipProfileDto,
  VipProductDto,
  CreateOrderDto,
  VipOrderDto,
  VipAuthResponse,
  PayCallbackDto,
} from './dto/vip.dto';
import * as crypto from 'crypto';

// In-memory code store (in production, use Redis)
const codeStore = new Map<string, { code: string; expiresAt: number }>();
// In-memory token store
const tokenStore = new Map<string, { userId: string; phone: string; expiresAt: number }>();

const VIP_PRODUCTS: VipProductDto[] = [
  {
    id: 'year',
    name: '年卡',
    description: '1年会员特权',
    price: 20,
    badge: '1年',
    features: [
      '无限书籍阅读',
      '优先客服支持',
      '新功能抢先体验',
      '去除广告',
    ],
  },
  {
    id: 'lifetime',
    name: '永久卡',
    description: '一次购买，永久有效',
    price: 60,
    badge: '永久',
    features: [
      '永久会员特权',
      '无限书籍阅读',
      '优先客服支持',
      '新功能抢先体验',
      '去除广告',
    ],
  },
];

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class VipService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  // =====================
  // Send Code
  // =====================
  async sendCode(dto: SendCodeDto): Promise<{ success: boolean; message: string }> {
    const { phone } = dto;

    // Validate phone format
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      throw new BadRequestException('Invalid phone number format');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + CODE_EXPIRY_MS;

    // Store code
    codeStore.set(phone, { code, expiresAt });

    // In production: integrate with SMS provider (e.g., Twilio, Alibaba Cloud)
    // For now: log to console for testing
    console.log(`[VIP] SMS Code for ${phone}: ${code}`);

    return {
      success: true,
      message: 'Verification code sent',
    };
  }

  // =====================
  // Login
  // =====================
  async login(
    dto: VipLoginDto,
  ): Promise<VipAuthResponse> {
    const { phone, code } = dto;

    // Validate phone format
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      throw new BadRequestException('Invalid phone number format');
    }

    // Verify code
    const stored = codeStore.get(phone);
    if (!stored || stored.code !== code || stored.expiresAt < Date.now()) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // Remove used code
    codeStore.delete(phone);

    // Find or create user
    const user = await this.findOrCreateVipUser(phone);

    // Generate token
    const token = this.generateToken(user.id);

    return {
      token,
      userId: user.id,
      phone: user.phone,
      level: user.level,
      isVip: user.level !== 'free',
      expiredAt: user.expiredAt?.toISOString() ?? null,
    };
  }

  // =====================
  // Token Login
  // =====================
  async tokenLogin(token: string): Promise<VipAuthResponse> {
    const stored = tokenStore.get(token);
    if (!stored || stored.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.vipMember.findUnique({
      where: { userId: stored.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      token,
      userId: user.userId,
      phone: user.phone,
      level: user.level,
      isVip: user.level !== 'free',
      expiredAt: user.expiredAt?.toISOString() ?? null,
    };
  }

  // =====================
  // Get Profile
  // =====================
  async getProfile(userId: string): Promise<VipProfileDto> {
    const member = await this.prisma.vipMember.findUnique({
      where: { userId },
    });

    if (!member) {
      // Return free user profile
      return {
        userId,
        phone: '',
        level: 'free',
        expiredAt: null,
        isVip: false,
        createdAt: new Date().toISOString(),
      };
    }

    return {
      userId: member.userId,
      phone: member.phone,
      level: member.level,
      expiredAt: member.expiredAt?.toISOString() ?? null,
      isVip: member.level !== 'free' && (!member.expiredAt || member.expiredAt > new Date()),
      createdAt: member.createdAt.toISOString(),
    };
  }

  // =====================
  // Get Products
  // =====================
  getProducts(): VipProductDto[] {
    return VIP_PRODUCTS;
  }

  // =====================
  // Create Order
  // =====================
  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<VipOrderDto> {
    const product = VIP_PRODUCTS.find((p) => p.id === dto.productId);
    if (!product) {
      throw new BadRequestException('Invalid product');
    }

    const orderId = `VIP_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const order = await this.prisma.vipOrder.create({
      data: {
        orderId,
        userId,
        productId: dto.productId,
        amount: product.price,
        status: 'pending',
      },
    });

    return {
      id: order.id,
      orderId: order.orderId,
      userId: order.userId,
      productId: order.productId,
      amount: order.amount,
      status: order.status,
      paidAt: order.paidAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
    };
  }

  // =====================
  // Get Order
  // =====================
  async getOrder(orderId: string): Promise<VipOrderDto> {
    const order = await this.prisma.vipOrder.findUnique({
      where: { orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      id: order.id,
      orderId: order.orderId,
      userId: order.userId,
      productId: order.productId,
      amount: order.amount,
      status: order.status,
      paidAt: order.paidAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
    };
  }

  // =====================
  // Payment Callback
  // =====================
  async paymentCallback(
    dto: PayCallbackDto,
  ): Promise<{ success: boolean; message: string }> {
    const order = await this.prisma.vipOrder.findUnique({
      where: { orderId: dto.orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'paid') {
      return { success: true, message: 'Order already paid' };
    }

    // Update order to paid
    await this.prisma.vipOrder.update({
      where: { orderId: dto.orderId },
      data: {
        status: 'paid',
        paidAt: new Date(),
      },
    });

    // Activate VIP membership
    const expiredAt =
      order.productId === 'year'
        ? new Date(Date.now() + 365 * 24 * 3600 * 1000)
        : null; // null = permanent

    await this.prisma.vipMember.upsert({
      where: { userId: order.userId },
      update: {
        level: order.productId,
        expiredAt,
      },
      create: {
        userId: order.userId,
        phone: '', // phone stored separately
        level: order.productId,
        expiredAt,
      },
    });

    return { success: true, message: 'Payment successful, VIP activated' };
  }

  // =====================
  // Private helpers
  // =====================
  private async findOrCreateVipUser(phone: string) {
    let member = await this.prisma.vipMember.findUnique({
      where: { phone },
    });

    if (!member) {
      // Create new user with free level
      member = await this.prisma.vipMember.create({
        data: {
          userId: crypto.randomUUID(),
          phone,
          level: 'free',
          expiredAt: null,
        },
      });
    }

    return member;
  }

  private generateToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    tokenStore.set(token, { userId, phone: '', expiresAt });
    return token;
  }

  // Validate a token and return userId
  async validateToken(token: string): Promise<string | null> {
    const stored = tokenStore.get(token);
    if (!stored || stored.expiresAt < Date.now()) {
      return null;
    }
    return stored.userId;
  }
}
