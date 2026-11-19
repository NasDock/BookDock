import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Token 名称，便于识别用途', example: 'NAS 同步' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({
    description: '有效天数，0 或不传表示永不过期',
    example: 30,
    minimum: 0,
    maximum: 3650,
  })
  @IsInt()
  @Min(0)
  @Max(3650)
  @IsOptional()
  expiresInDays?: number;
}

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ description: '重命名', example: 'NAS 同步（新）' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: '启用 / 停用', example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: '重设有效天数；0=永不过期，null=保持原值',
    example: 30,
    minimum: 0,
    maximum: 3650,
  })
  @IsInt()
  @Min(0)
  @Max(3650)
  @IsOptional()
  expiresInDays?: number | null;
}

export class ApiKeyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ nullable: true })
  lastUsedAt: Date | null;

  @ApiProperty({ nullable: true })
  expiresAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class CreatedApiKeyResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    description: 'Token 明文，仅创建时返回一次，请立即保存',
    example: 'bd_1f4c...',
  })
  token: string;
}
