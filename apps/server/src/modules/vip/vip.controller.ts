import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { VipService } from './vip.service';
import {
  SendCodeDto,
  VipLoginDto,
  VipProfileDto,
  VipProductDto,
  CreateOrderDto,
  VipOrderDto,
  PayCallbackDto,
  VipAuthResponse,
} from './dto/vip.dto';

@ApiTags('VIP')
@Controller('vip')
@ApiHeader({ name: 'Authorization', required: false, description: 'Bearer token' })
export class VipController {
  constructor(private readonly vipService: VipService) {}

  // =====================
  // POST /api/vip/send-code
  // =====================
  @Post('send-code')
  @ApiOperation({ summary: 'Send SMS verification code' })
  @ApiResponse({ status: 200, description: 'Code sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid phone number' })
  async sendCode(@Body() dto: SendCodeDto) {
    return this.vipService.sendCode(dto);
  }

  // =====================
  // POST /api/vip/login
  // =====================
  @Post('login')
  @ApiOperation({ summary: 'VIP login with phone + code' })
  @ApiResponse({ status: 200, type: VipAuthResponse })
  @ApiResponse({ status: 400, description: 'Invalid code or expired' })
  async login(@Body() dto: VipLoginDto) {
    return this.vipService.login(dto);
  }

  // =====================
  // GET /api/vip/profile
  // =====================
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get VIP profile' })
  @ApiResponse({ status: 200, type: VipProfileDto })
  async getProfile(@Headers('authorization') auth: string) {
    const token = this.extractToken(auth);
    if (!token) throw new UnauthorizedException('Missing token');
    const userId = await this.vipService.validateToken(token);
    if (!userId) throw new UnauthorizedException('Invalid token');
    return this.vipService.getProfile(userId);
  }

  // =====================
  // GET /api/vip/products
  // =====================
  @Get('products')
  @ApiOperation({ summary: 'Get VIP product list' })
  @ApiResponse({ status: 200, type: [VipProductDto] })
  async getProducts() {
    return this.vipService.getProducts();
  }

  // =====================
  // POST /api/vip/create-order
  // =====================
  @Post('create-order')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a VIP order' })
  @ApiResponse({ status: 201, type: VipOrderDto })
  async createOrder(
    @Headers('authorization') auth: string,
    @Body() dto: CreateOrderDto,
  ) {
    const token = this.extractToken(auth);
    if (!token) throw new UnauthorizedException('Missing token');
    const userId = await this.vipService.validateToken(token);
    if (!userId) throw new UnauthorizedException('Invalid token');
    return this.vipService.createOrder(userId, dto);
  }

  // =====================
  // GET /api/vip/order/:id
  // =====================
  @Get('order/:id')
  @ApiOperation({ summary: 'Get order status' })
  @ApiResponse({ status: 200, type: VipOrderDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrder(@Param('id') orderId: string) {
    return this.vipService.getOrder(orderId);
  }

  // =====================
  // POST /api/vip/callback
  // =====================
  @Post('callback')
  @ApiOperation({ summary: 'Payment callback (WeChat/Alipay)' })
  @ApiResponse({ status: 200 })
  async paymentCallback(@Body() dto: PayCallbackDto) {
    return this.vipService.paymentCallback(dto);
  }

  // =====================
  // Helper
  // =====================
  private extractToken(auth: string): string | null {
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    return parts[1];
  }
}
