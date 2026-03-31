import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthResponseDto, LoginDto, RefreshTokenDto, RegisterDto, UserInfoDto, SendSmsCodeDto, LoginWithPhoneDto, RegisterWithPhoneDto, SmsCodeResponseDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ipAddress = req.socket?.remoteAddress;
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request & { headers: { 'user-agent'?: string } },
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.socket?.remoteAddress;
    return this.authService.login(dto, userAgent, ipAddress);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  async logout(
    @CurrentUser('sub') userId: string,
    @Body() dto: RefreshTokenDto,
  ) {
    await this.authService.logout(userId, dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, type: UserInfoDto })
  async getCurrentUser(@CurrentUser('sub') userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  // ─── Phone + SMS Auth ───────────────────────────────────────────────────────

  @Post('send-sms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send SMS verification code' })
  @ApiResponse({ status: 200, type: SmsCodeResponseDto })
  async sendSmsCode(@Body() dto: SendSmsCodeDto) {
    return this.authService.sendSmsCode(dto.phone);
  }

  @Post('login/phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone + SMS code' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async loginWithPhone(
    @Body() dto: LoginWithPhoneDto,
    @Req() req: Request & { headers: { 'user-agent'?: string } },
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.socket?.remoteAddress;
    return this.authService.loginWithPhone(dto, userAgent, ipAddress);
  }

  @Post('register/phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register with phone + SMS code' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async registerWithPhone(
    @Body() dto: RegisterWithPhoneDto,
    @Req() req: Request & { headers: { 'user-agent'?: string } },
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.socket?.remoteAddress;
    return this.authService.registerWithPhone(dto, userAgent, ipAddress);
  }
}
