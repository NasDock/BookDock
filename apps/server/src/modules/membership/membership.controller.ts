import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MembershipService } from './membership.service';
import {
  MembershipPlanDto,
  SubscriptionDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  UsageDto,
  CreatePaymentDto,
  PaymentDto,
} from './dto/membership.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Membership')
@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  // ─── Plans ─────────────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'List all membership plans' })
  @ApiResponse({ status: 200, type: [MembershipPlanDto] })
  async getPlans() {
    return this.membershipService.getPlans();
  }

  @Get('plans/:planId')
  @ApiOperation({ summary: 'Get a specific plan' })
  @ApiResponse({ status: 200, type: MembershipPlanDto })
  async getPlan(@Param('planId') planId: string) {
    return this.membershipService.getPlan(planId as any);
  }

  // ─── Subscription ──────────────────────────────────────────────────────────

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user subscription' })
  @ApiResponse({ status: 200, type: SubscriptionDto })
  async getSubscription(@CurrentUser('sub') userId: string) {
    return this.membershipService.getSubscription(userId);
  }

  @Post('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create/upgrade subscription' })
  @ApiResponse({ status: 201, type: SubscriptionDto })
  async createSubscription(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.membershipService.createSubscription(userId, dto);
  }

  @Put('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update subscription plan' })
  @ApiResponse({ status: 200, type: SubscriptionDto })
  async updateSubscription(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.membershipService.updateSubscription(userId, dto);
  }

  @Delete('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({ status: 200, type: SubscriptionDto })
  async cancelSubscription(@CurrentUser('sub') userId: string) {
    return this.membershipService.cancelSubscription(userId);
  }

  // ─── Payment ───────────────────────────────────────────────────────────────

  @Post('payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a payment (generates QR code for wechat/alipay)' })
  @ApiResponse({ status: 201, type: PaymentDto })
  async createPayment(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.membershipService.createPayment(userId, dto);
  }

  @Get('payment/:paymentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details' })
  @ApiResponse({ status: 200, type: PaymentDto })
  async getPayment(@Param('paymentId') paymentId: string) {
    return this.membershipService.getPayment(paymentId);
  }

  @Get('payments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user payment history' })
  @ApiResponse({ status: 200, type: [PaymentDto] })
  async getPayments(@CurrentUser('sub') userId: string) {
    return this.membershipService.getPayments(userId);
  }

  @Get('payment/:paymentId/poll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poll payment status (for QR code payments)' })
  @ApiResponse({ status: 200, type: PaymentDto })
  async pollPayment(@Param('paymentId') paymentId: string) {
    return this.membershipService.pollPayment(paymentId);
  }

  @Post('payment/:paymentId/simulate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Simulate payment success (for testing only)' })
  @ApiResponse({ status: 200, type: PaymentDto })
  async simulatePaymentSuccess(@Param('paymentId') paymentId: string) {
    return this.membershipService.simulatePaymentSuccess(paymentId);
  }

  @Post('payment/:paymentId/callback')
  @ApiOperation({ summary: 'Payment callback from WeChat/Alipay' })
  async paymentCallback(
    @Param('paymentId') paymentId: string,
    @Body() body: { tradeNo?: string; status?: 'SUCCESS' | 'FAIL' | 'CLOSED' },
  ) {
    await this.membershipService.handlePaymentCallback(
      paymentId,
      body.tradeNo || `EXT${Date.now()}`,
      body.status || 'SUCCESS',
    );
    return { message: 'ok' };
  }

  // ─── Usage ─────────────────────────────────────────────────────────────────

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current usage statistics' })
  @ApiResponse({ status: 200, type: UsageDto })
  async getUsage(@CurrentUser('sub') userId: string) {
    return this.membershipService.getUsage(userId);
  }
}
