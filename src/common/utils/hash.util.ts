import * as crypto from 'crypto';

/**
 * Normalizes text by trimming whitespace, collapsing multiple spaces into a single space,
 * and converting to lowercase for consistent comparison.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Computes a deterministic SHA-256 hash for a question.
 *
 * Hash formula:
 * SHA256(class + "::" + normalize(chapter) + "::" + normalize(question) + "::" + sorted(options.map(normalize)).join("|"))
 *
 * Rationale:
 * - Including sorted options ensures re-ordering options (A/B/C/D shuffled) is still recognized as the duplicate question.
 * - Minor whitespace and casing variations are stripped.
 * - Including class and chapter ensures questions that might have similar phrasing in different contexts remain scoped properly,
 *   while guaranteeing strict uniqueness within that class and chapter.
 */
export function computeQuestionHash(
  classNum: number,
  chapter: string,
  question: string,
  options: string[],
): string {
  const normClass = String(classNum).trim();
  const normChapter = normalizeText(chapter);
  const normQuestion = normalizeText(question);
  const sortedNormOptions = options.map(normalizeText).sort().join('|');

  const contentToHash = `${normClass}::${normChapter}::${normQuestion}::${sortedNormOptions}`;
  return crypto.createHash('sha256').update(contentToHash).digest('hex');
}
