import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    IsPhoneNumber,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'johndoe', minLength: 3, maxLength: 100 })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  username: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.user })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  password: string;
}

// Phone + SMS Login DTOs
export class SendSmsCodeDto {
  @ApiProperty({ example: '+8613912345678' })
  @IsString()
  @MaxLength(20)
  phone: string;
}

export class LoginWithPhoneDto {
  @ApiProperty({ example: '+8613912345678' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  code: string;
}

export class RegisterWithPhoneDto {
  @ApiProperty({ example: '+8613912345678' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  code: string;

  @ApiPropertyOptional({ example: 'johndoe' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  username?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class UserInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty()
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty({ type: () => UserInfoDto })
  user: UserInfoDto;
}

export class SmsCodeResponseDto {
  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  expiresIn?: number; // seconds until code expires
}
