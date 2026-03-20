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
} from './dto/membership.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Membership')
@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

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
  @ApiOperation({ summary: 'Create/upgrade subscription (simulated - use Stripe in production)' })
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

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current usage statistics' })
  @ApiResponse({ status: 200, type: UsageDto })
  async getUsage(@CurrentUser('sub') userId: string) {
    return this.membershipService.getUsage(userId);
  }
}
