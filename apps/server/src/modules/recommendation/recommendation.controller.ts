import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RecommendationService } from './recommendation.service';
import { RecommendationsResponseDto } from './dto/recommendation.dto';

@ApiTags('Recommendations')
@Controller('recommendations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get()
  @ApiOperation({ summary: 'Get personalized book recommendations' })
  @ApiResponse({ status: 200, type: RecommendationsResponseDto })
  async getRecommendations(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: string,
  ): Promise<RecommendationsResponseDto> {
    const result = await this.recommendationService.getRecommendations(
      userId,
      limit ? parseInt(limit, 10) : 12,
    );
    return { books: result.books };
  }
}
