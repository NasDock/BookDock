import {
    Inject,
    Injectable,
    NotFoundException
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    CreateSubscriptionDto,
    MembershipPlan,
    MembershipPlanDto,
    SubscriptionDto,
    SubscriptionStatus,
    UpdateSubscriptionDto,
    UsageDto,
} from './dto/membership.dto';

// Membership plans configuration
const PLANS: MembershipPlanDto[] = [
  {
    id: MembershipPlan.FREE,
    name: 'Free',
    description: 'Basic ebook reading experience',
    price: 0,
    currency: 'USD',
    interval: 'forever',
    features: [
      'Read epub, pdf, txt books',
      'Basic reading progress tracking',
      '5 collections',
      '5 bookmarks per book',
      'Community support',
    ],
    limits: {
      booksUpload: 100,
      storageGb: 1,
      ttsEnabled: false,
      ttsQuotaMinPerMonth: 0,
      collectionsMax: 5,
      concurrentDevices: 1,
    },
  },
  {
    id: MembershipPlan.BASIC,
    name: 'Basic',
    description: 'Enhanced reading with TTS',
    price: 4.99,
    currency: 'USD',
    interval: 'month',
    features: [
      'Everything in Free',
      'Text-to-Speech (100 min/month)',
      'Unlimited collections',
      '30 bookmarks per book',
      'Email support',
    ],
    limits: {
      booksUpload: -1,
      storageGb: 10,
      ttsEnabled: true,
      ttsQuotaMinPerMonth: 100,
      collectionsMax: -1,
      concurrentDevices: 2,
    },
  },
  {
    id: MembershipPlan.PREMIUM,
    name: 'Premium',
    description: 'Full power reader',
    price: 9.99,
    currency: 'USD',
    interval: 'month',
    features: [
      'Everything in Basic',
      'Unlimited TTS',
      'Priority support',
      'Early access to new features',
    ],
    limits: {
      booksUpload: -1,
      storageGb: 50,
      ttsEnabled: true,
      ttsQuotaMinPerMonth: -1,
      collectionsMax: -1,
      concurrentDevices: 5,
    },
  },
  {
    id: MembershipPlan.FAMILY,
    name: 'Family',
    description: 'Share with up to 6 family members',
    price: 14.99,
    currency: 'USD',
    interval: 'month',
    features: [
      'Everything in Premium',
      'Up to 6 family accounts',
      'Shared family library',
      'Parental controls',
      'Dedicated support',
    ],
    limits: {
      booksUpload: -1,
      storageGb: 100,
      ttsEnabled: true,
      ttsQuotaMinPerMonth: -1,
      collectionsMax: -1,
      concurrentDevices: 6,
    },
  },
];

@Injectable()
export class MembershipService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  getPlans(): MembershipPlanDto[] {
    return PLANS;
  }

  getPlan(planId: MembershipPlan): MembershipPlanDto {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);
    return plan;
  }

  async getSubscription(userId: string): Promise<SubscriptionDto | null> {
    const sub = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        preferences: true,
        createdAt: true,
      },
    });

    if (!sub) throw new NotFoundException('User not found');

    // Determine subscription from role
    const plan = sub.role === 'admin' ? MembershipPlan.PREMIUM : MembershipPlan.FREE;
    const isActive = sub.role !== 'guest';

    return {
      id: `sub_${sub.id}`,
      userId: sub.id,
      plan,
      status: isActive ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
      autoRenew: false,
      createdAt: sub.createdAt,
    };
  }

  async createSubscription(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    // In production, this would integrate with Stripe
    // For now, we'll simulate by updating user role
    const plan = this.getPlan(dto.plan);

    const sub = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: {
          ...((await this.prisma.user.findUnique({ where: { id: userId } }))?.preferences as object || {}),
          subscription: {
            plan: dto.plan,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
            autoRenew: true,
          },
        },
      },
    });

    return {
      id: `sub_${sub.id}`,
      userId: sub.id,
      plan: dto.plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      autoRenew: true,
      createdAt: sub.createdAt,
    };
  }

  async updateSubscription(
    userId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    const current = await this.getSubscription(userId);
    if (!current) throw new NotFoundException('Subscription not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: {
          subscription: {
            plan: dto.plan || current.plan,
            status: current.status,
            autoRenew: dto.autoRenew !== undefined ? dto.autoRenew : current.autoRenew,
          },
        },
      },
    });

    return {
      ...current,
      plan: dto.plan || current.plan,
      autoRenew: dto.autoRenew !== undefined ? dto.autoRenew : current.autoRenew,
    };
  }

  async cancelSubscription(userId: string): Promise<SubscriptionDto> {
    const current = await this.getSubscription(userId);
    if (!current) throw new NotFoundException('Subscription not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: {
          subscription: {
            plan: current.plan,
            status: SubscriptionStatus.CANCELLED,
            cancelledAt: new Date(),
            autoRenew: false,
          },
        },
      },
    });

    return {
      ...current,
      status: SubscriptionStatus.CANCELLED,
      autoRenew: false,
      cancelledAt: new Date(),
    };
  }

  async getUsage(userId: string): Promise<UsageDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { collections: true } },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const plan = user.role === 'admin' ? MembershipPlan.PREMIUM : MembershipPlan.FREE;
    const planConfig = this.getPlan(plan);

    const [storageResult, booksCount] = await Promise.all([
      this.prisma.book.aggregate({
        _sum: { fileSize: true },
        where: { isDeleted: false },
      }),
      this.prisma.book.count({ where: { isDeleted: false } }),
    ]);

    const storageUsed = Number(storageResult._sum.fileSize || BigInt(0));
    const storageGb = storageUsed / (1024 * 1024 * 1024);

    return {
      userId,
      plan,
      storageUsedBytes: BigInt(storageUsed),
      storageLimitBytes: BigInt(planConfig.limits.storageGb * 1024 * 1024 * 1024),
      ttsUsedMin: 0, // Would track from TTS jobs table
      ttsLimitMin: planConfig.limits.ttsQuotaMinPerMonth,
      booksUploaded: booksCount,
      booksLimit: planConfig.limits.booksUpload,
      collectionsCount: user._count.collections,
      collectionsLimit: planConfig.limits.collectionsMax,
    };
  }
}
