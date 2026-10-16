import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { QuestionsService, StoredQuestion } from './questions.service.js';
import { DuplicateStrategy, IngestionSummary } from './dto/upload-questions.dto.js';
import { QuestionInputDto } from './dto/question.dto.js';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload and validate questions from JSON file or direct paste',
    description:
      'Accepts either a JSON array of questions or an object with { questions: [...], duplicateStrategy: "skip"|"overwrite"|"keep_both" }. ' +
      'Performs atomic batch writes and duplicate detection via SHA-256 hash.',
  })
  async uploadQuestions(@Body() payload: any): Promise<IngestionSummary> {
    let rawList: any[] = [];
    let strategy: DuplicateStrategy = DuplicateStrategy.SKIP;

    if (Array.isArray(payload)) {
      rawList = payload;
    } else if (payload && Array.isArray(payload.questions)) {
      rawList = payload.questions;
      if (payload.duplicateStrategy) {
        strategy = payload.duplicateStrategy;
      }
    } else {
      throw new BadRequestException(
        'Request body must be either an array of question objects or an object containing a "questions" array.',
      );
    }

    if (rawList.length === 0) {
      throw new BadRequestException('Question array cannot be empty.');
    }

    const validatedQuestions: QuestionInputDto[] = [];
    const validationErrors: Array<{ index: number; question?: string; message: string }> = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const dto = plainToInstance(QuestionInputDto, item);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const errorMessages = errors
          .map(e => Object.values(e.constraints || {}).join(', '))
          .join('; ');
        validationErrors.push({
          index: i,
          question: item?.question,
          message: errorMessages,
        });
      } else {
        validatedQuestions.push(dto);
      }
    }

    if (validationErrors.length > 0 && validatedQuestions.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'All questions in the batch failed validation.',
        errors: validationErrors,
      });
    }

    const summary = await this.questionsService.ingestQuestions(validatedQuestions, strategy);
    if (validationErrors.length > 0) {
      summary.errors = [...validationErrors, ...summary.errors];
    }

    return summary;
  }

  @Post()
  @ApiOperation({ summary: 'Add a single question manually' })
  @ApiResponse({ status: 201, description: 'Question created successfully' })
  async createQuestion(@Body() dto: QuestionInputDto): Promise<StoredQuestion> {
    return this.questionsService.createSingleQuestion(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing question' })
  async updateQuestion(
    @Param('id') id: string,
    @Body() dto: QuestionInputDto,
  ): Promise<StoredQuestion> {
    return this.questionsService.updateQuestion(id, dto);
  }

  @Patch(':id/bookmark')
  @ApiOperation({ summary: 'Toggle bookmark status on a question' })
  async toggleBookmark(@Param('id') id: string): Promise<{ id: string; bookmarked: boolean }> {
    return this.questionsService.toggleBookmark(id);
  }

  @Get()
  @ApiOperation({ summary: 'Filter and retrieve questions by class, chapter, tag, search, or state' })
  @ApiQuery({ name: 'class', required: false, enum: [11, 12] })
  @ApiQuery({ name: 'chapter', required: false, type: String })
  @ApiQuery({ name: 'chapters', required: false, type: String, description: 'Comma-separated chapter names' })
  @ApiQuery({ name: 'tag', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'bookmarked', required: false, type: Boolean })
  @ApiQuery({ name: 'previouslyWrong', required: false, type: Boolean })
  @ApiQuery({ name: 'unattempted', required: false, type: Boolean, description: 'Questions not asked even once' })
  @ApiQuery({ name: 'maxAttempts', required: false, type: Number, description: 'Filter questions asked less than N times' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'randomize', required: false, type: Boolean })
  async getQuestions(
    @Query('class') classFilter?: string,
    @Query('chapter') chapter?: string,
    @Query('chapters') chapters?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('bookmarked') bookmarked?: string,
    @Query('previouslyWrong') previouslyWrong?: string,
    @Query('unattempted') unattempted?: string,
    @Query('maxAttempts') maxAttempts?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('randomize') randomize?: string,
  ): Promise<{ total: number; questions: StoredQuestion[] }> {
    const chaptersArray = chapters ? chapters.split(',').map(c => c.trim()).filter(Boolean) : undefined;

    return this.questionsService.getQuestions({
      class: classFilter ? (parseInt(classFilter, 10) as 11 | 12) : undefined,
      chapter,
      chapters: chaptersArray,
      tag,
      search,
      bookmarked: bookmarked !== undefined ? bookmarked === 'true' : undefined,
      previouslyWrong: previouslyWrong !== undefined ? previouslyWrong === 'true' : undefined,
      unattempted: unattempted !== undefined ? unattempted === 'true' : undefined,
      maxAttempts: maxAttempts !== undefined ? parseInt(maxAttempts, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      randomize: randomize === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single question by its ID' })
  async getQuestionById(@Param('id') id: string): Promise<StoredQuestion | null> {
    const question = await this.questionsService.getById(id);
    if (!question) {
      throw new BadRequestException(`Question with ID ${id} not found.`);
    }
    return question;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a question by its ID' })
  async deleteQuestion(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    await this.questionsService.deleteQuestion(id);
    return { success: true, message: `Question ${id} deleted successfully.` };
  }
}
