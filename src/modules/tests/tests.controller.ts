import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TestsService } from './tests.service.js';
import { SubmitTestDto, TestResultSummary } from './dto/submit-test.dto.js';

@ApiTags('tests')
@Controller('tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Post('submit')
  @ApiOperation({
    summary: 'Submit test results, calculate score, update SRS queue, and update previously_wrong tags',
  })
  @ApiResponse({ status: 201, description: 'Test graded successfully with question breakdowns' })
  async submitTest(@Body() dto: SubmitTestDto): Promise<TestResultSummary> {
    return this.testsService.submitTest(dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get past test attempts history' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistory(@Query('limit') limit?: string): Promise<TestResultSummary[]> {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.testsService.getHistory(limitNum);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details and per-question breakdown of a specific test session' })
  async getTestById(@Param('id') id: string): Promise<TestResultSummary> {
    return this.testsService.getTestById(id);
  }
}
