import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsBoolean, IsOptional, IsString } from 'class-validator';

export enum MembershipPlan {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  FAMILY = 'family',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

export interface MembershipPlanDto {
  id: MembershipPlan;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
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
  autoRenew?: boolean;

  @ApiPropertyOptional()
  currentPeriodStart?: Date;

  @ApiPropertyOptional()
  currentPeriodEnd?: Date;

  @ApiPropertyOptional()
  cancelledAt?: Date;

  @ApiProperty()
  createdAt: Date;
}

export class CreateSubscriptionDto {
  @ApiProperty({ enum: MembershipPlan })
  @IsEnum(MembershipPlan)
  plan: MembershipPlan;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: MembershipPlan })
  @IsOptional()
  @IsEnum(MembershipPlan)
  plan?: MembershipPlan;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}

export class UsageDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: MembershipPlan })
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
