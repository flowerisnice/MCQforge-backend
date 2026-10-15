import { Controller, Get, Post, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ChaptersService } from './chapters.service.js';
import { CanonicalChapter } from './data/canonical-chapters.js';

@ApiTags('chapters')
@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all canonical chapters (ordered 1 to 32), optionally filtered by class' })
  @ApiQuery({ name: 'class', required: false, enum: [11, 12], description: 'Filter by Class 11 (1-19) or Class 12 (20-32)' })
  @ApiResponse({ status: 200, description: 'List of canonical chapters' })
  async getChapters(@Query('class') classFilter?: string): Promise<CanonicalChapter[]> {
    const classNum = classFilter ? parseInt(classFilter, 10) : undefined;
    return this.chaptersService.getAll(classNum);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Manually trigger idempotent seeding of all 32 canonical chapters' })
  @ApiResponse({ status: 201, description: 'Seeding result' })
  async seedChapters(): Promise<{ message: string; count: number; chapters: CanonicalChapter[] }> {
    const result = await this.chaptersService.seedChapters();
    return {
      message: 'Successfully seeded canonical chapters into Firestore',
      count: result.count,
      chapters: result.chapters,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single chapter by ID (e.g. c11-the-living-world)' })
  async getChapterById(@Param('id') id: string): Promise<CanonicalChapter | null> {
    return this.chaptersService.getById(id);
  }
}
