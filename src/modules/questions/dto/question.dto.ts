import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Custom validator ensuring correctAnswer is either:
 * 1. An exact string match against one of the options (after trimming), OR
 * 2. A valid 0-based option index (0 to options.length - 1).
 */
@ValidatorConstraint({ name: 'IsValidCorrectAnswer', async: false })
export class IsValidCorrectAnswerConstraint implements ValidatorConstraintInterface {
  validate(correctAnswer: any, args: ValidationArguments): boolean {
    const object = args.object as any;
    if (!object || !Array.isArray(object.options) || object.options.length === 0) {
      return false;
    }
    const options: string[] = object.options;

    // Check numeric index (e.g. 0, 1, 2, 3)
    if (typeof correctAnswer === 'number' && Number.isInteger(correctAnswer)) {
      return correctAnswer >= 0 && correctAnswer < options.length;
    }

    // Check string: either numeric string "0" or exact trimmed match
    if (typeof correctAnswer === 'string') {
      const trimmed = correctAnswer.trim();
      if (/^\d+$/.test(trimmed)) {
        const idx = parseInt(trimmed, 10);
        if (idx >= 0 && idx < options.length) {
          return true;
        }
      }
      return options.some(opt => typeof opt === 'string' && opt.trim() === trimmed);
    }

    return false;
  }

  defaultMessage(args: ValidationArguments): string {
    const object = args.object as any;
    const opts = Array.isArray(object?.options) ? object.options : [];
    return (
      `correctAnswer '${args.value}' must either match one of the options ` +
      `[${opts.map((o: any) => JSON.stringify(o)).join(', ')}] ` +
      `or be a valid 0-based option index (0 to ${opts.length > 0 ? opts.length - 1 : 0}).`
    );
  }
}

/**
 * Resolves correctAnswer to its canonical option string value.
 */
export function resolveCorrectAnswerString(
  correctAnswer: string | number,
  options: string[],
): string {
  if (typeof correctAnswer === 'number' && Number.isInteger(correctAnswer)) {
    return options[correctAnswer]?.trim() ?? String(correctAnswer);
  }
  const str = String(correctAnswer).trim();
  if (/^\d+$/.test(str)) {
    const idx = parseInt(str, 10);
    if (idx >= 0 && idx < options.length) {
      return options[idx].trim();
    }
  }
  const found = options.find(opt => opt.trim() === str);
  return found ? found.trim() : str;
}

export class QuestionInputDto {
  @ApiProperty({ description: 'The question text (supports rich text/subscripts)', example: 'Which of the following is the basic unit of life?' })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiProperty({ description: 'List of 2 or more options', example: ['Tissue', 'Cell', 'Organ', 'Organism'] })
  @IsArray()
  @MinLength(1, { each: true })
  options: string[];

  @ApiProperty({
    description: 'Exact matching option string or 0-based index',
    example: 'Cell',
  })
  @Validate(IsValidCorrectAnswerConstraint)
  correctAnswer: string | number;

  @ApiProperty({ description: 'Textbook line citation proving the answer', example: 'The cell is the basic structural and functional unit of all living organisms.' })
  @IsString()
  @IsNotEmpty()
  sourceText: string;

  @ApiProperty({ description: 'Canonical chapter name', example: 'Cell: The Unit of Life' })
  @IsString()
  @IsNotEmpty()
  chapter: string;

  @ApiProperty({ description: 'Class level: 11 or 12', example: 11, enum: [11, 12] })
  @IsNumber()
  @IsIn([11, 12])
  class: 11 | 12;

  @ApiPropertyOptional({ description: 'Tags list', example: ['important', 'pyq'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Optional detailed explanation' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ description: 'Optional diagram/image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
