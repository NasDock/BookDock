import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum MembershipPlan {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  FAMILY = 'family',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  PAST_DUE = 'past_due',
  EXPIRED = 'expired',
  TRIALING = 'trialing',
}

export class MembershipPlanDto {
  @ApiProperty({ enum: MembershipPlan })
  id: MembershipPlan;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  interval: string;

  @ApiProperty()
  features: string[];

  @ApiProperty()
  limits: {
    booksUpload: number;
    storageGb: number;
    ttsEnabled: boolean;
    ttsQuotaMinPerMonth: number;
    collectionsMax: number;
    concurrentDevices: number;
  };
}

export class SubscriptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: MembershipPlan })
  plan: MembershipPlan;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiPropertyOptional()
  currentPeriodStart?: Date;

  @ApiPropertyOptional()
  currentPeriodEnd?: Date;

  @ApiPropertyOptional()
  cancelledAt?: Date;

  @ApiProperty()
  autoRenew: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class SubscriptionQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;
}

export class CreateSubscriptionDto {
  @ApiProperty({ enum: MembershipPlan })
  @IsEnum(MembershipPlan)
  plan: MembershipPlan;

  @ApiPropertyOptional({ example: 'stripe_payment_intent_id' })
  @IsString()
  @IsOptional()
  paymentIntentId?: string;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: MembershipPlan })
  @IsEnum(MembershipPlan)
  @IsOptional()
  plan?: MembershipPlan;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  autoRenew?: boolean;
}

export class UsageDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  plan: MembershipPlan;

  @ApiProperty()
  storageUsedBytes: bigint;

  @ApiProperty()
  storageLimitBytes: bigint;

  @ApiProperty()
  ttsUsedMin: number;

  @ApiProperty()
  ttsLimitMin: number;

  @ApiProperty()
  booksUploaded: number;

  @ApiProperty()
  booksLimit: number;

  @ApiProperty()
  collectionsCount: number;

  @ApiProperty()
  collectionsLimit: number;
}
