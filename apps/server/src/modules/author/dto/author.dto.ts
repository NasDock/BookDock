import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuthorDto {
  @ApiProperty({ example: '金庸' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Jin Yong' })
  @IsString()
  @IsOptional()
  nameSort?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '1924-03-10' })
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ example: '2018-10-30' })
  @IsString()
  @IsOptional()
  deathDate?: string;

  @ApiPropertyOptional({ example: '中国' })
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  source?: string;
}

export class UpdateAuthorDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nameSort?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deathDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  source?: string;
}
