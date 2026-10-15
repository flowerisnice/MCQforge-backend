import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TagsService } from './tags.service.js';
import { MergeTagsDto, RenameTagDto, TagInfo } from './dto/tag.dto.js';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List all unique tags with usage counts across the question bank' })
  @ApiResponse({ status: 200, description: 'List of tags' })
  async getTags(): Promise<TagInfo[]> {
    return this.tagsService.getAllTags();
  }

  @Post('rename')
  @ApiOperation({ summary: 'Rename a tag across all questions in Firestore' })
  async renameTag(@Body() dto: RenameTagDto): Promise<{ updatedCount: number; message: string }> {
    return this.tagsService.renameTag(dto.oldName, dto.newName);
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge a source tag into a target tag across all questions' })
  async mergeTags(@Body() dto: MergeTagsDto): Promise<{ updatedCount: number; message: string }> {
    return this.tagsService.mergeTags(dto.sourceTag, dto.targetTag);
  }
}
