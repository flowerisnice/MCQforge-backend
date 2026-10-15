import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get overall analytics metrics, streak, and SRS mastery summary' })
  @ApiResponse({ status: 200, description: 'Aggregated analytics overview' })
  async getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('chapters')
  @ApiOperation({ summary: 'Get chapter-wise accuracy heatmap across all 32 canonical chapters' })
  @ApiQuery({ name: 'class', required: false, enum: [11, 12] })
  @ApiResponse({ status: 200, description: 'Chapter heatmap items' })
  async getChapterHeatmap(@Query('class') classFilter?: string) {
    const num = classFilter ? (parseInt(classFilter, 10) as 11 | 12) : undefined;
    return this.analyticsService.getChapterHeatmap(num);
  }

  @Get('srs-queue')
  @ApiOperation({ summary: 'Get questions due for Spaced Repetition review today' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Questions due for review' })
  async getSrsQueue(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.analyticsService.getSrsQueue(lim);
  }
}
