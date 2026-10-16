import { describe, it, expect, beforeEach } from 'vitest';
import { QuestionsService } from './questions.service.js';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';
import { DuplicateStrategy } from './dto/upload-questions.dto.js';

describe('QuestionsService (Batch Ingestion & Duplicate Handling)', () => {
  let service: QuestionsService;
  let firebaseService: FirebaseAdminService;

  beforeEach(() => {
    firebaseService = new FirebaseAdminService();
    firebaseService.onModuleInit();
    service = new QuestionsService(firebaseService);
  });

  it('should successfully ingest questions and return correct summary', async () => {
    const runId = Math.random().toString(36).substring(2, 9);
    const raw = [
      {
        question: `Unit of life test [${runId}]`,
        options: ['Tissue', 'Cell', 'Organ', 'Organism'],
        correctAnswer: 'Cell',
        sourceText: 'The cell is the basic structural and functional unit of all living organisms.',
        chapter: 'Cell: The Unit of Life',
        class: 11 as const,
        tags: ['important', 'easy'],
      },
      {
        question: `Powerhouse of cell test [${runId}]`,
        options: ['Ribosome', 'Mitochondria', 'Golgi apparatus', 'Lysosome'],
        correctAnswer: 1, // 0-based index
        sourceText: 'Mitochondria are the sites of aerobic respiration.',
        chapter: 'Cell: The Unit of Life',
        class: 11 as const,
        tags: ['pyq'],
      },
    ];

    const summary = await service.ingestQuestions(raw, DuplicateStrategy.SKIP);

    expect(summary.success).toBe(true);
    expect(summary.totalReceived).toBe(2);
    expect(summary.insertedCount).toBe(2);
    expect(summary.skippedCount).toBe(0);
    expect(summary.duplicateCount).toBe(0);
    expect(summary.chaptersDetected).toContain('Cell: The Unit of Life');
    expect(summary.insertedIds.length).toBe(2);

    // Verify stored content
    const res = await service.getQuestions({ search: runId });
    expect(res.total).toBe(2);
    // Mitochondria index 1 should be resolved to string 'Mitochondria'
    const mito = res.questions.find(q => q.question.includes('Powerhouse'));
    expect(mito?.correctAnswer).toBe('Mitochondria');
  }, 20000);

  it('should skip duplicate questions when strategy is SKIP (even if options are shuffled)', async () => {
    const runId = Math.random().toString(36).substring(2, 9);
    const original = [
      {
        question: `Hormone fight-or-flight test [${runId}]`,
        options: ['Insulin', 'Adrenaline', 'Thyroxine', 'Estrogen'],
        correctAnswer: 'Adrenaline',
        sourceText: 'Adrenaline is rapidly secreted in response to stress.',
        chapter: 'Chemical Coordination and Integration',
        class: 11 as const,
      },
    ];
    const initialSummary = await service.ingestQuestions(original, DuplicateStrategy.SKIP);
    expect(initialSummary.insertedCount).toBe(1);

    // Same question, but options shuffled
    const duplicate = [
      {
        question: `Hormone fight-or-flight test [${runId}]`,
        options: ['Estrogen', 'Thyroxine', 'Adrenaline', 'Insulin'],
        correctAnswer: 'Adrenaline',
        sourceText: 'Updated source text.',
        chapter: 'Chemical Coordination and Integration',
        class: 11 as const,
      },
    ];

    const summary = await service.ingestQuestions(duplicate, DuplicateStrategy.SKIP);
    expect(summary.totalReceived).toBe(1);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.insertedCount).toBe(0);

    const res = await service.getQuestions({ search: runId });
    expect(res.total).toBe(1);
    expect(res.questions[0].sourceText).toBe('Adrenaline is rapidly secreted in response to stress.');
  });

  it('should overwrite duplicate questions when strategy is OVERWRITE', async () => {
    const runId = Math.random().toString(36).substring(2, 9);
    const original = [
      {
        question: `Photosynthesis test [${runId}]`,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        sourceText: 'Old text',
        chapter: 'Photosynthesis in Higher Plants',
        class: 11 as const,
      },
    ];
    const initialSummary = await service.ingestQuestions(original, DuplicateStrategy.SKIP);
    expect(initialSummary.insertedCount).toBe(1);

    const updated = [
      {
        question: `Photosynthesis test [${runId}]`,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        sourceText: 'Brand new updated text',
        chapter: 'Photosynthesis in Higher Plants',
        class: 11 as const,
      },
    ];

    const summary = await service.ingestQuestions(updated, DuplicateStrategy.OVERWRITE);
    expect(summary.updatedCount).toBe(1);
    expect(summary.insertedCount).toBe(0);

    const res = await service.getQuestions({ search: runId });
    expect(res.total).toBe(1);
    expect(res.questions[0].sourceText).toBe('Brand new updated text');
  });

  it('should correctly filter questions with tag "undone" and tag "less_than_4"', async () => {
    const runId = Math.random().toString(36).substring(2, 9);
    const questions = [
      {
        question: `Unattempted question test [${runId}]`,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        sourceText: 'Some source proof text',
        chapter: 'Cell: The Unit of Life',
        class: 11 as const,
      },
    ];
    await service.ingestQuestions(questions, DuplicateStrategy.SKIP);

    // Filter by tag: 'undone'
    const resUndone = await service.getQuestions({ search: runId, tag: 'undone' });
    expect(resUndone.total).toBe(1);

    // Filter by unattempted: true
    const resUnattempted = await service.getQuestions({ search: runId, unattempted: true });
    expect(resUnattempted.total).toBe(1);

    // Filter by tag: 'less_than_4'
    const resLt4 = await service.getQuestions({ search: runId, tag: 'less_than_4' });
    expect(resLt4.total).toBe(1);

    // Filter by maxAttempts: 4
    const resMaxAttempts = await service.getQuestions({ search: runId, maxAttempts: 4 });
    expect(resMaxAttempts.total).toBe(1);
  });
});
