import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { QuestionInputDto } from './question.dto.js';

export enum DuplicateStrategy {
  SKIP = 'skip',
  OVERWRITE = 'overwrite',
  KEEP_BOTH = 'keep_both',
}

export class UploadQuestionsDto {
  @ApiProperty({ type: [QuestionInputDto], description: 'Array of questions to validate and store' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionInputDto)
  questions: QuestionInputDto[];

  @ApiPropertyOptional({
    enum: DuplicateStrategy,
    default: DuplicateStrategy.SKIP,
    description: 'Strategy when a duplicate hash is detected: skip, overwrite, or keep_both',
  })
  @IsOptional()
  @IsEnum(DuplicateStrategy)
  duplicateStrategy?: DuplicateStrategy = DuplicateStrategy.SKIP;
}

export interface IngestionSummary {
  success: boolean;
  totalReceived: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  duplicateCount: number;
  chaptersDetected: string[];
  errors: Array<{ index: number; question?: string; message: string }>;
  insertedIds: string[];
}
