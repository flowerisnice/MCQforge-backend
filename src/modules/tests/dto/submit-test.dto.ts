import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AnswerSubmissionDto {
  @ApiProperty({ description: 'Question ID' })
  @IsString()
  @IsNotEmpty()
  qid: string;

  @ApiProperty({ description: 'User selected answer text or null if skipped', nullable: true })
  @IsOptional()
  selectedAnswer: string | null;

  @ApiProperty({ description: 'Time spent on this question in seconds' })
  @IsNumber()
  timeSpentSeconds: number;

  @ApiPropertyOptional({ description: 'Whether the question was flagged for review' })
  @IsOptional()
  @IsBoolean()
  flagged?: boolean;
}

export class SubmitTestDto {
  @ApiProperty({ enum: ['quiz', 'test'], description: 'Quiz Mode (instant) or Test Mode (deferred)' })
  @IsIn(['quiz', 'test'])
  mode: 'quiz' | 'test';

  @ApiPropertyOptional({ description: 'Class level: 11, 12, or both' })
  @IsOptional()
  class?: 11 | 12 | 'both';

  @ApiPropertyOptional({ description: 'Chapters selected for the test' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chapters?: string[];

  @ApiPropertyOptional({ description: 'Negative marking enabled' })
  @IsOptional()
  @IsBoolean()
  negativeMarking?: boolean = false;

  @ApiPropertyOptional({ description: 'Negative marks per wrong answer', default: 0.25 })
  @IsOptional()
  @IsNumber()
  negativeMarkValue?: number = 0.25;

  @ApiProperty({ description: 'Total time taken in seconds' })
  @IsNumber()
  totalTimeSeconds: number;

  @ApiProperty({ type: [AnswerSubmissionDto], description: 'List of submitted answers' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerSubmissionDto)
  answers: AnswerSubmissionDto[];
}

export interface QuestionResultItem {
  qid: string;
  question: string;
  options: string[];
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
  sourceText: string;
  explanation?: string;
  chapter: string;
  class: 11 | 12;
  flagged: boolean;
}

export interface TestResultSummary {
  testId: string;
  mode: 'quiz' | 'test';
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  score: number;
  maxScore: number;
  accuracy: number;
  negativeMarking: boolean;
  negativeDeductions: number;
  totalTimeSeconds: number;
  averageTimePerQuestion: number;
  chapterBreakdown: Record<string, { total: number; correct: number; wrong: number }>;
  questions: QuestionResultItem[];
  completedAt: string;
}
