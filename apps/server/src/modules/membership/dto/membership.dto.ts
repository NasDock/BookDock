import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MembershipPlan, SubscriptionStatus, PaymentMethod, PaymentStatus } from '@prisma/client';

export { MembershipPlan, SubscriptionStatus, PaymentMethod, PaymentStatus };

export class MembershipPlanDto {
  @ApiProperty({ enum: MembershipPlan })
  id: MembershipPlan;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  price: number; // in cents (¥20 = 2000, ¥60 = 6000)

  @ApiProperty()
  currency: string;

  @ApiProperty()
  interval: string;

  @ApiProperty()
  features: string[];

  @ApiProperty()
  badge?: string; // e.g. "年卡", "永久卡"
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

  @ApiPropertyOptional({ example: 'payment_id' })
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

// Payment DTOs
export class CreatePaymentDto {
  @ApiProperty({ enum: MembershipPlan })
  @IsEnum(MembershipPlan)
  plan: MembershipPlan;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}

export class PaymentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: MembershipPlan })
  plan: MembershipPlan;

  @ApiProperty({ enum: PaymentMethod })
  method: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiPropertyOptional()
  tradeNo?: string;

  @ApiPropertyOptional()
  qrCode?: string;

  @ApiPropertyOptional()
  qrCodeExpiredAt?: Date;

  @ApiPropertyOptional()
  paidAt?: Date;

  @ApiProperty()
  createdAt: Date;
}

export class PaymentQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;
}
