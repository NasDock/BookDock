import {
    Inject,
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaClient, MembershipPlan, SubscriptionStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    CreateSubscriptionDto,
    MembershipPlanDto,
    SubscriptionDto,
    UpdateSubscriptionDto,
    UsageDto,
    CreatePaymentDto,
    PaymentDto,
} from './dto/membership.dto';

// BookDock membership plans (Chinese pricing)
const PLANS: MembershipPlanDto[] = [
  {
    id: MembershipPlan.FREE,
    name: '免费版',
    description: '基础阅读体验',
    price: 0,
    currency: 'CNY',
    interval: '永久',
    features: [
      '阅读 epub、pdf、txt 电子书',
      '基础阅读进度追踪',
      '5 个收藏夹',
      '每本书 5 个书签',
      '社区支持',
    ],
  },
  {
    id: MembershipPlan.ANNUAL,
    name: '年卡',
    description: '全年无限制阅读',
    badge: '年卡',
    price: 2000, // ¥20 in cents
    currency: 'CNY',
    interval: '1年',
    features: [
      '🆕 无限收藏夹',
      '🆕 每本书无限书签',
      '🆕 朗读功能（TTS）',
      '🆕 优先客服支持',
      '🆕 新功能抢先体验',
      '所有免费版功能',
    ],
  },
  {
    id: MembershipPlan.LIFETIME,
    name: '永久卡',
    description: '一次购买，终身使用',
    badge: '永久卡',
    price: 6000, // ¥60 in cents
    currency: 'CNY',
    interval: '永久',
    features: [
      '👑 永久会员权益',
      '👑 无限收藏夹',
      '👑 每本书无限书签',
      '👑 无限时长朗读（TTS）',
      '👑 专属客服支持',
      '👑 所有年卡功能',
      '👑 永久有效，无需续费',
    ],
  },
];

@Injectable()
export class MembershipService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  // ─── Plans ─────────────────────────────────────────────────────────────────

  getPlans(): MembershipPlanDto[] {
    return PLANS;
  }

  getPlan(planId: MembershipPlan): MembershipPlanDto {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) throw new NotFoundException('Membership plan not found');
    return plan;
  }

  // ─── Subscription ──────────────────────────────────────────────────────────

  async getSubscription(userId: string): Promise<SubscriptionDto | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription) return null;
    return this.toSubscriptionDto(subscription);
  }

  async createSubscription(userId: string, dto: CreateSubscriptionDto): Promise<SubscriptionDto> {
    const plan = this.getPlan(dto.plan);
    if (plan.price === 0) {
      throw new BadRequestException('Free plan does not need subscription');
    }

    // Check if user already has a subscription
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (existing) {
      throw new BadRequestException('User already has a subscription. Use update instead.');
    }

    // Calculate period end
    const now = new Date();
    const periodEnd = dto.plan === MembershipPlan.ANNUAL
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : null; // lifetime = permanent

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        plan: dto.plan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        autoRenew: dto.plan === MembershipPlan.ANNUAL,
      },
    });

    return this.toSubscriptionDto(subscription);
  }

  async updateSubscription(userId: string, dto: UpdateSubscriptionDto): Promise<SubscriptionDto> {
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('No subscription found');

    if (dto.autoRenew !== undefined) {
      await this.prisma.subscription.update({
        where: { userId },
        data: { autoRenew: dto.autoRenew },
      });
    }

    const updated = await this.prisma.subscription.findUnique({ where: { userId } });
    return this.toSubscriptionDto(updated!);
  }

  async cancelSubscription(userId: string): Promise<SubscriptionDto> {
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('No subscription found');

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
        autoRenew: false,
      },
    });

    return this.toSubscriptionDto(updated);
  }

  // ─── Payment ────────────────────────────────────────────────────────────────

  async createPayment(userId: string, dto: CreatePaymentDto): Promise<PaymentDto> {
    const plan = this.getPlan(dto.plan);
    if (plan.price === 0) {
      throw new BadRequestException('Free plan does not need payment');
    }

    // Generate a mock trade number
    const tradeNo = `BD${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    let qrCode: string | null = null;
    let qrCodeExpiredAt: Date | null = null;

    // Generate QR code for wechat/alipay
    if (dto.method !== PaymentMethod.SIMULATED) {
      const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
      qrCodeExpiredAt = expiredAt;
      // In production, call WeChat/Alipay API to get real QR code
      // For now, generate a placeholder data URL
      qrCode = this.generateMockQRCode(tradeNo, dto.method);
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        plan: dto.plan,
        amount: plan.price,
        currency: plan.currency,
        method: dto.method,
        status: dto.method === PaymentMethod.SIMULATED ? PaymentStatus.PAID : PaymentStatus.PENDING,
        tradeNo,
        qrCode,
        qrCodeExpiredAt,
        paidAt: dto.method === PaymentMethod.SIMULATED ? new Date() : null,
      },
    });

    // For simulated payments, immediately activate subscription
    if (dto.method === PaymentMethod.SIMULATED) {
      await this.activateSubscription(userId, dto.plan);
    }

    return this.toPaymentDto(payment);
  }

  async getPayment(paymentId: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.toPaymentDto(payment);
  }

  async getPayments(userId: string): Promise<PaymentDto[]> {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(p => this.toPaymentDto(p));
  }

  async pollPayment(paymentId: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status === PaymentStatus.PENDING && payment.qrCodeExpiredAt && new Date() > payment.qrCodeExpiredAt) {
      // QR code expired
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.EXPIRED },
      });
    }

    const updated = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    return this.toPaymentDto(updated!);
  }

  // Webhook endpoint for WeChat/Alipay to call
  async handlePaymentCallback(paymentId: string, tradeNo: string, status: 'SUCCESS' | 'FAIL' | 'CLOSED'): Promise<void> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    let newStatus: PaymentStatus;
    switch (status) {
      case 'SUCCESS': newStatus = PaymentStatus.PAID; break;
      case 'FAIL': newStatus = PaymentStatus.FAILED; break;
      case 'CLOSED': newStatus = PaymentStatus.CANCELLED; break;
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        tradeNo,
        paidAt: status === 'SUCCESS' ? new Date() : undefined,
      },
    });

    if (status === 'SUCCESS') {
      await this.activateSubscription(payment.userId, payment.plan);
    }
  }

  // Simulate payment success (for testing)
  async simulatePaymentSuccess(paymentId: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not in pending status');
    }

    const tradeNo = `SIM${Date.now()}`;
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        tradeNo,
        paidAt: new Date(),
        qrCode: null, // Clear QR code after payment
      },
    });

    await this.activateSubscription(payment.userId, payment.plan);

    const updated = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    return this.toPaymentDto(updated!);
  }

  // ─── Usage ──────────────────────────────────────────────────────────────────

  async getUsage(userId: string): Promise<UsageDto> {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    const plan = subscription?.plan || MembershipPlan.FREE;

    const [bookCount, collectionCount, ttsUsage] = await Promise.all([
      // Count user's books (simplified)
      this.prisma.book.count({ where: { /* user books */ } }),
      this.prisma.collection.count({ where: { userId } }),
      // Count TTS usage (simplified)
      0,
    ]);

    const limits = this.getPlanLimits(plan);

    return {
      userId,
      plan,
      storageUsedBytes: BigInt(0),
      storageLimitBytes: BigInt(limits.storageGb * 1024 * 1024 * 1024),
      ttsUsedMin: ttsUsage,
      ttsLimitMin: limits.ttsQuotaMinPerMonth,
      booksUploaded: bookCount,
      booksLimit: limits.booksUpload,
      collectionsCount: collectionCount,
      collectionsLimit: limits.collectionsMax,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async activateSubscription(userId: string, plan: MembershipPlan): Promise<void> {
    const now = new Date();
    const periodEnd = plan === MembershipPlan.ANNUAL
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : null; // lifetime

    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        autoRenew: plan === MembershipPlan.ANNUAL,
      },
      update: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
        autoRenew: plan === MembershipPlan.ANNUAL,
      },
    });
  }

  private getPlanLimits(plan: MembershipPlan) {
    switch (plan) {
      case MembershipPlan.FREE:
        return { booksUpload: 100, storageGb: 1, ttsEnabled: false, ttsQuotaMinPerMonth: 0, collectionsMax: 5, concurrentDevices: 1 };
      case MembershipPlan.ANNUAL:
        return { booksUpload: -1, storageGb: 20, ttsEnabled: true, ttsQuotaMinPerMonth: -1, collectionsMax: -1, concurrentDevices: 3 };
      case MembershipPlan.LIFETIME:
        return { booksUpload: -1, storageGb: 100, ttsEnabled: true, ttsQuotaMinPerMonth: -1, collectionsMax: -1, concurrentDevices: 5 };
    }
  }

  private toSubscriptionDto(s: any): SubscriptionDto {
    return {
      id: s.id,
      userId: s.userId,
      plan: s.plan,
      status: s.status,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelledAt: s.cancelledAt,
      autoRenew: s.autoRenew,
      createdAt: s.createdAt,
    };
  }

  private toPaymentDto(p: any): PaymentDto {
    return {
      id: p.id,
      userId: p.userId,
      amount: p.amount,
      currency: p.currency,
      plan: p.plan,
      method: p.method,
      status: p.status,
      tradeNo: p.tradeNo || undefined,
      qrCode: p.qrCode || undefined,
      qrCodeExpiredAt: p.qrCodeExpiredAt || undefined,
      paidAt: p.paidAt || undefined,
      createdAt: p.createdAt,
    };
  }

  private generateMockQRCode(tradeNo: string, method: PaymentMethod): string {
    // In production, call actual WeChat/Alipay API
    // For demo: return a placeholder SVG data URL
    const label = method === PaymentMethod.WECHAT ? '微信支付' : '支付宝';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="50%" y="45%" text-anchor="middle" font-size="14">${label}</text><text x="50%" y="60%" text-anchor="middle" font-size="12">订单: ${tradeNo}</text><text x="50%" y="75%" text-anchor="middle" font-size="10">请使用${label}扫码</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
}
