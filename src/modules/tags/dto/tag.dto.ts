import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RenameTagDto {
  @ApiProperty({ description: 'Existing tag name', example: 'important' })
  @IsString()
  @IsNotEmpty()
  oldName: string;

  @ApiProperty({ description: 'New tag name', example: 'high_yield' })
  @IsString()
  @IsNotEmpty()
  newName: string;
}

export class MergeTagsDto {
  @ApiProperty({ description: 'Tag to merge and remove', example: 'hard_questions' })
  @IsString()
  @IsNotEmpty()
  sourceTag: string;

  @ApiProperty({ description: 'Target tag to keep', example: 'hard' })
  @IsString()
  @IsNotEmpty()
  targetTag: string;
}

export interface TagInfo {
  name: string;
  count: number;
  isReserved: boolean;
}
