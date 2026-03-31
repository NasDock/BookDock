import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';

// =====================
// Send Code
// =====================
export class SendCodeDto {
  @ApiProperty({ example: '13800138000' })
  @IsString()
  @MinLength(11)
  phone: string;
}

// =====================
// Login
// =====================
export class VipLoginDto {
  @ApiProperty({ example: '13800138000' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
}

export class VipTokenLoginDto {
  @ApiProperty()
  @IsString()
  token: string;
}

// =====================
// Profile
// =====================
export class VipProfileDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  level: string; // 'free' | 'year' | 'lifetime'

  @ApiPropertyOptional()
  expiredAt: string | null; // null = 永久

  @ApiProperty()
  isVip: boolean;

  @ApiProperty()
  createdAt: string;
}

// =====================
// Products
// =====================
export class VipProductDto {
  @ApiProperty({ example: 'year' })
  id: string;

  @ApiProperty({ example: '年卡' })
  name: string;

  @ApiProperty({ example: '1年会员特权' })
  description: string;

  @ApiProperty({ example: 20 })
  price: number; // RMB

  @ApiProperty({ example: '1年' })
  badge: string;

  @ApiProperty({ example: ['无限书籍', '优先客服', '新功能体验'] })
  features: string[];
}

// =====================
// Create Order
// =====================
export class CreateOrderDto {
  @ApiProperty({ enum: ['year', 'lifetime'] })
  @IsEnum(['year', 'lifetime'])
  productId: string;

  @ApiProperty({ enum: ['wechat', 'alipay', 'simulated'] })
  @IsEnum(['wechat', 'alipay', 'simulated'])
  @IsOptional()
  method?: string;
}

// =====================
// Order
// =====================
export class VipOrderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  productId: string; // 'year' | 'lifetime'

  @ApiProperty()
  amount: number; // RMB

  @ApiProperty()
  status: string; // 'pending' | 'paid' | 'expired'

  @ApiPropertyOptional()
  paidAt: string | null;

  @ApiProperty()
  createdAt: string;
}

// =====================
// Pay Callback
// =====================
export class PayCallbackDto {
  @ApiProperty()
  @IsString()
  orderId: string;

  @ApiProperty()
  @IsString()
  tradeNo: string;

  @ApiProperty({ enum: ['wechat', 'alipay'] })
  @IsString()
  method: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;
}

// =====================
// Auth Response
// =====================
export class VipAuthResponse {
  @ApiProperty()
  token: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  level: string;

  @ApiProperty()
  isVip: boolean;

  @ApiPropertyOptional()
  expiredAt: string | null;
}
