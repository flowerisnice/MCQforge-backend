import { describe, it, expect } from 'vitest';
import { computeQuestionHash, normalizeText } from './hash.util.js';
import { resolveCorrectAnswerString, IsValidCorrectAnswerConstraint } from '../../modules/questions/dto/question.dto.js';

describe('Hash and Normalization Utilities', () => {
  it('should normalize strings by trimming, lowercasing, and collapsing spaces', () => {
    expect(normalizeText('  Hello    World  ')).toBe('hello world');
    expect(normalizeText('Cell: The Unit of Life')).toBe('cell: the unit of life');
  });

  it('should produce identical hash for same question with different option order', () => {
    const q = 'Which of the following is the basic unit of life?';
    const chap = 'Cell: The Unit of Life';
    const cls = 11;

    const hash1 = computeQuestionHash(cls, chap, q, ['Tissue', 'Cell', 'Organ', 'Organism']);
    const hash2 = computeQuestionHash(cls, chap, q, ['Organism', 'Tissue', 'Cell', 'Organ']);

    expect(hash1).toBe(hash2);
  });

  it('should produce identical hash regardless of casing and extra whitespace', () => {
    const q1 = 'What is Mitochondria?';
    const q2 = '  what   is mitochondria? ';
    const chap = 'Cell: The Unit of Life';
    const cls = 11;

    const hash1 = computeQuestionHash(cls, chap, q1, ['a', 'b', 'c']);
    const hash2 = computeQuestionHash(cls, chap, q2, ['A ', ' b', '  c']);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different chapters or classes', () => {
    const q = 'What is DNA?';
    const options = ['A', 'B', 'C', 'D'];

    const hashClass11 = computeQuestionHash(11, 'Biomolecules', q, options);
    const hashClass12 = computeQuestionHash(12, 'Molecular Basis of Inheritance', q, options);

    expect(hashClass11).not.toBe(hashClass12);
  });
});

describe('correctAnswer Validation and Resolution', () => {
  const validator = new IsValidCorrectAnswerConstraint();
  const options = ['Tissue', 'Cell', 'Organ', 'Organism'];
  const fakeArgs = (val: any) => ({ object: { options }, value: val } as any);

  it('should validate exact string matches (case-sensitive or trimmed)', () => {
    expect(validator.validate('Cell', fakeArgs('Cell'))).toBe(true);
    expect(validator.validate(' Cell ', fakeArgs(' Cell '))).toBe(true);
    expect(validator.validate('Tissue', fakeArgs('Tissue'))).toBe(true);
    expect(validator.validate('Invalid', fakeArgs('Invalid'))).toBe(false);
  });

  it('should validate 0-based integer indices', () => {
    expect(validator.validate(0, fakeArgs(0))).toBe(true);
    expect(validator.validate(1, fakeArgs(1))).toBe(true);
    expect(validator.validate(3, fakeArgs(3))).toBe(true);
    expect(validator.validate(4, fakeArgs(4))).toBe(false); // out of bounds
    expect(validator.validate(-1, fakeArgs(-1))).toBe(false);
  });

  it('should validate string integer indices', () => {
    expect(validator.validate('0', fakeArgs('0'))).toBe(true);
    expect(validator.validate('1', fakeArgs('1'))).toBe(true);
    expect(validator.validate('9', fakeArgs('9'))).toBe(false);
  });

  it('should resolve index to canonical option string', () => {
    expect(resolveCorrectAnswerString(1, options)).toBe('Cell');
    expect(resolveCorrectAnswerString('0', options)).toBe('Tissue');
    expect(resolveCorrectAnswerString('Organism', options)).toBe('Organism');
    expect(resolveCorrectAnswerString(' Organ ', options)).toBe('Organ');
  });
});
