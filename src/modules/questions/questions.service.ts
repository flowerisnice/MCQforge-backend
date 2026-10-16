import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';
import { computeQuestionHash } from '../../common/utils/hash.util.js';
import { findCanonicalChapter } from '../chapters/data/canonical-chapters.js';
import { QuestionInputDto, resolveCorrectAnswerString } from './dto/question.dto.js';
import { DuplicateStrategy, IngestionSummary } from './dto/upload-questions.dto.js';
import * as crypto from 'crypto';

export interface StoredQuestion {
  id: string;
  hash: string;
  question: string;
  options: string[];
  correctAnswer: string;
  sourceText: string;
  chapter: string;
  class: 11 | 12;
  tags: string[];
  explanation?: string;
  imageUrl?: string;
  bookmarked?: boolean;
  previouslyWrong?: boolean;
  timesAttempted?: number;
  timesWrong?: number;
  createdAt: string;
  updatedAt: string;
}

export interface QueryQuestionsFilter {
  class?: 11 | 12;
  chapter?: string;
  chapters?: string[];
  tag?: string;
  search?: string;
  bookmarked?: boolean;
  previouslyWrong?: boolean;
  unattempted?: boolean;
  maxAttempts?: number;
  since?: string;
  ids?: string[];
  excludeIds?: string[];
  limit?: number;
  offset?: number;
  randomize?: boolean;
}

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);
  private cachedQuestions: StoredQuestion[] | null = null;
  private lastCacheTime = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60s memory cache to eliminate full DB scans

  constructor(private readonly firebaseService: FirebaseAdminService) {}

  public invalidateCache(): void {
    this.cachedQuestions = null;
    this.lastCacheTime = 0;
  }

  private async loadAllQuestions(): Promise<StoredQuestion[]> {
    const now = Date.now();
    if (this.cachedQuestions && now - this.lastCacheTime < this.CACHE_TTL_MS) {
      return this.cachedQuestions;
    }

    const db = this.firebaseService.getFirestore();
    const [qSnap, stateSnap] = await Promise.all([
      db.collection('questions').get(),
      db.collection('questionState').get().catch(() => ({ docs: [] } as any)),
    ]);

    const stateMap = new Map<string, any>();
    stateSnap.docs.forEach((doc: any) => {
      stateMap.set(doc.id, doc.data());
    });

    const list: StoredQuestion[] = [];
    qSnap.docs.forEach(doc => {
      const data = doc.data() as StoredQuestion;
      const state = stateMap.get(doc.id);
      list.push({
        ...data,
        bookmarked: state ? !!state.bookmarked : data.tags?.includes('bookmarked') || false,
        previouslyWrong: state ? !!state.previouslyWrong : data.tags?.includes('previously_wrong') || false,
        timesAttempted: state?.timesAttempted || 0,
        timesWrong: state?.timesWrong || 0,
      });
    });

    this.cachedQuestions = list;
    this.lastCacheTime = now;
    return list;
  }

  /**
   * Validates and batch-writes an array of questions to Firestore.
   * Handles duplicate detection by hash according to the selected strategy.
   */
  async ingestQuestions(
    rawQuestions: QuestionInputDto[],
    strategy: DuplicateStrategy = DuplicateStrategy.SKIP,
  ): Promise<IngestionSummary> {
    if (!rawQuestions || rawQuestions.length === 0) {
      throw new BadRequestException('Question list cannot be empty.');
    }

    const db = this.firebaseService.getFirestore();
    const summary: IngestionSummary = {
      success: true,
      totalReceived: rawQuestions.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      chaptersDetected: [],
      errors: [],
      insertedIds: [],
    };

    const chaptersSet = new Set<string>();

    // 1. Fetch all existing question hashes for O(1) duplicate detection
    const existingHashToDoc = new Map<string, { id: string; data: any }>();
    try {
      const existingSnap = await db.collection('questions').get();
      existingSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.hash) {
          existingHashToDoc.set(data.hash, { id: doc.id, data });
        }
      });
    } catch (err: any) {
      this.logger.warn(`Could not preload existing hashes: ${err.message}`);
    }

    // 2. Process and prepare operations
    interface PreparedWrite {
      id: string;
      isUpdate: boolean;
      questionData: StoredQuestion;
    }
    const writes: PreparedWrite[] = [];

    for (let i = 0; i < rawQuestions.length; i++) {
      const q = rawQuestions[i];

      try {
        // Resolve canonical chapter name if possible
        const canonical = findCanonicalChapter(q.chapter, q.class);
        const resolvedChapter = canonical ? canonical.name : q.chapter.trim();
        chaptersSet.add(resolvedChapter);

        // Normalize options
        const normalizedOptions = q.options.map(opt => String(opt).trim());

        // Resolve correctAnswer to string value
        const resolvedAnswer = resolveCorrectAnswerString(q.correctAnswer, normalizedOptions);

        // Compute deterministic hash
        const hash = computeQuestionHash(q.class, resolvedChapter, q.question, normalizedOptions);

        const existing = existingHashToDoc.get(hash);
        const now = new Date().toISOString();

        if (existing) {
          summary.duplicateCount++;
          if (strategy === DuplicateStrategy.SKIP) {
            summary.skippedCount++;
            continue;
          } else if (strategy === DuplicateStrategy.OVERWRITE) {
            const docId = existing.id;
            const updatedData: StoredQuestion = {
              id: docId,
              hash,
              question: q.question.trim(),
              options: normalizedOptions,
              correctAnswer: resolvedAnswer,
              sourceText: q.sourceText.trim(),
              chapter: resolvedChapter,
              class: q.class,
              tags: q.tags ? Array.from(new Set(q.tags.map(t => t.trim().toLowerCase()))) : [],
              explanation: q.explanation?.trim() || undefined,
              imageUrl: q.imageUrl?.trim() || undefined,
              createdAt: existing.data.createdAt || now,
              updatedAt: now,
            };
            writes.push({ id: docId, isUpdate: true, questionData: updatedData });
            summary.updatedCount++;
            summary.insertedIds.push(docId);
            continue;
          }
          // If keep_both, fall through to create a new unique doc
        }

        // Fresh insert (or keep_both)
        const newId = crypto.randomUUID();
        const storedDoc: StoredQuestion = {
          id: newId,
          hash,
          question: q.question.trim(),
          options: normalizedOptions,
          correctAnswer: resolvedAnswer,
          sourceText: q.sourceText.trim(),
          chapter: resolvedChapter,
          class: q.class,
          tags: q.tags ? Array.from(new Set(q.tags.map(t => t.trim().toLowerCase()))) : [],
          explanation: q.explanation?.trim() || undefined,
          imageUrl: q.imageUrl?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };

        // Cache in local map for within-batch duplicate detection
        existingHashToDoc.set(hash, { id: newId, data: storedDoc });

        writes.push({ id: newId, isUpdate: false, questionData: storedDoc });
        summary.insertedCount++;
        summary.insertedIds.push(newId);
      } catch (err: any) {
        summary.errors.push({
          index: i,
          question: q.question,
          message: err.message || 'Validation or processing error',
        });
      }
    }

    summary.chaptersDetected = Array.from(chaptersSet);

    // 3. Batch commit to Firestore safely (Firestore limits to max 500 writes per batch).
    // Inserts do 2 operations (question + questionState), updates do 1 operation.
    // We cap each batch at 400 operations to stay comfortably under 500.
    const MAX_OPERATIONS_PER_BATCH = 400;
    let currentBatch = db.batch();
    let currentOpCount = 0;

    for (const item of writes) {
      const opsForItem = item.isUpdate ? 1 : 2;
      if (currentOpCount + opsForItem > MAX_OPERATIONS_PER_BATCH) {
        await currentBatch.commit();
        currentBatch = db.batch();
        currentOpCount = 0;
      }

      const questionRef = db.collection('questions').doc(item.id);
      currentBatch.set(questionRef, item.questionData);
      currentOpCount++;

      // Also initialize questionState for new questions
      if (!item.isUpdate) {
        const stateRef = db.collection('questionState').doc(item.id);
        currentBatch.set(stateRef, {
          qid: item.id,
          timesAttempted: 0,
          timesCorrect: 0,
          timesWrong: 0,
          lastAttemptedAt: null,
          bookmarked: false,
          previouslyWrong: false,
          srsLevel: 0,
          srsDueDate: null,
        });
        currentOpCount++;
      }
    }

    if (currentOpCount > 0) {
      await currentBatch.commit();
    }

    // Invalidate local in-memory cache so subsequent reads get the newly inserted questions
    this.invalidateCache();

    // 4. Update aggregate meta counters
    try {
      const statsRef = db.collection('meta').doc('stats');
      const statsSnap = await statsRef.get();
      const currentTotal = statsSnap.exists ? (statsSnap.data()?.totalQuestions || 0) : 0;
      await statsRef.set(
        {
          totalQuestions: currentTotal + summary.insertedCount,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (err: any) {
      this.logger.warn(`Could not update meta/stats counter: ${err.message}`);
    }

    this.logger.log(
      `Ingested ${rawQuestions.length} questions: ${summary.insertedCount} inserted, ` +
      `${summary.updatedCount} updated, ${summary.skippedCount} skipped.`,
    );

    return summary;
  }

  /**
   * Single question creation from authoring modal.
   */
  async createSingleQuestion(q: QuestionInputDto): Promise<StoredQuestion> {
    const summary = await this.ingestQuestions([q], DuplicateStrategy.OVERWRITE);
    if (summary.insertedIds.length === 0) {
      throw new BadRequestException('Failed to create question. It may be duplicate or invalid.');
    }
    const created = await this.getById(summary.insertedIds[0]);
    if (!created) {
      throw new BadRequestException('Question was created but could not be retrieved.');
    }
    return created;
  }

  /**
   * Updates an existing question in Firestore.
   */
  async updateQuestion(id: string, q: QuestionInputDto): Promise<StoredQuestion> {
    const db = this.firebaseService.getFirestore();
    const docRef = db.collection('questions').doc(id);
    const existingSnap = await docRef.get();
    if (!existingSnap.exists) {
      throw new NotFoundException(`Question with ID ${id} not found.`);
    }

    const canonical = findCanonicalChapter(q.chapter, q.class);
    const resolvedChapter = canonical ? canonical.name : q.chapter.trim();
    const normalizedOptions = q.options.map(opt => String(opt).trim());
    const resolvedAnswer = resolveCorrectAnswerString(q.correctAnswer, normalizedOptions);
    const hash = computeQuestionHash(q.class, resolvedChapter, q.question, normalizedOptions);

    const now = new Date().toISOString();
    const updated: StoredQuestion = {
      id,
      hash,
      question: q.question.trim(),
      options: normalizedOptions,
      correctAnswer: resolvedAnswer,
      sourceText: q.sourceText.trim(),
      chapter: resolvedChapter,
      class: q.class,
      tags: q.tags ? Array.from(new Set(q.tags.map(t => t.trim().toLowerCase()))) : [],
      explanation: q.explanation?.trim() || undefined,
      imageUrl: q.imageUrl?.trim() || undefined,
      createdAt: existingSnap.data()?.createdAt || now,
      updatedAt: now,
    };

    await docRef.set(updated, { merge: true });
    this.invalidateCache();
    return updated;
  }

  /**
   * Toggles bookmark state for a question in questionState and updates question tags.
   */
  async toggleBookmark(id: string): Promise<{ id: string; bookmarked: boolean }> {
    const db = this.firebaseService.getFirestore();
    const stateRef = db.collection('questionState').doc(id);
    const qRef = db.collection('questions').doc(id);

    const [stateSnap, qSnap] = await Promise.all([stateRef.get(), qRef.get()]);

    if (!qSnap.exists) {
      throw new NotFoundException(`Question with ID ${id} not found.`);
    }

    const currentBookmarked = stateSnap.exists ? !!stateSnap.data()?.bookmarked : false;
    const newBookmarked = !currentBookmarked;

    const batch = db.batch();

    batch.set(
      stateRef,
      {
        qid: id,
        bookmarked: newBookmarked,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    // Update tags array on question document
    const currentTags: string[] = qSnap.data()?.tags || [];
    let updatedTags: string[];
    if (newBookmarked) {
      updatedTags = Array.from(new Set([...currentTags, 'bookmarked']));
    } else {
      updatedTags = currentTags.filter(t => t.toLowerCase() !== 'bookmarked');
    }

    batch.update(qRef, { tags: updatedTags });
    await batch.commit();

    this.invalidateCache();
    return { id, bookmarked: newBookmarked };
  }

  /**
   * Lightweight manifest of all questions in bank.
   * Allows clients to detect missing questions and avoid unnecessary requests.
   */
  async getManifest(): Promise<{
    total: number;
    lastUpdated: string;
    items: Array<{ id: string; hash: string; updatedAt: string }>;
  }> {
    const all = await this.loadAllQuestions();
    let maxUpdated = '';
    const items = all.map(q => {
      const u = q.updatedAt || q.createdAt || '';
      if (u > maxUpdated) maxUpdated = u;
      return { id: q.id, hash: q.hash, updatedAt: u };
    });
    return {
      total: items.length,
      lastUpdated: maxUpdated || new Date().toISOString(),
      items,
    };
  }

  /**
   * Returns only questions whose IDs are NOT in the client's knownIds list (local storage).
   * Paged in chunks so that the client only downloads missing delta without unnecessary requests.
   */
  async getMissingQuestions(
    knownIds: string[] = [],
    limit: number = 100,
    offset: number = 0,
  ): Promise<{ totalMissing: number; hasMore: boolean; questions: StoredQuestion[] }> {
    const all = await this.loadAllQuestions();
    const knownSet = new Set(knownIds);
    const missing = all.filter(q => !knownSet.has(q.id));
    const totalMissing = missing.length;
    const paged = missing.slice(offset, offset + limit);
    return {
      totalMissing,
      hasMore: offset + limit < totalMissing,
      questions: paged,
    };
  }

  /**
   * Retrieves specific questions by list of IDs.
   */
  async getByIds(ids: string[]): Promise<StoredQuestion[]> {
    if (!ids || ids.length === 0) return [];
    const all = await this.loadAllQuestions();
    const idSet = new Set(ids);
    return all.filter(q => idSet.has(q.id));
  }

  /**
   * Retrieves questions with flexible filtering by class, chapters, tags, search query, states, and incremental since.
   */
  async getQuestions(filter: QueryQuestionsFilter = {}): Promise<{ total: number; questions: StoredQuestion[] }> {
    const all = await this.loadAllQuestions();
    let list = [...all];

    // 0. Since filter (incremental delta sync)
    if (filter.since) {
      const sinceDate = new Date(filter.since).getTime();
      if (!isNaN(sinceDate)) {
        list = list.filter(q => {
          const updated = new Date(q.updatedAt || q.createdAt).getTime();
          return updated > sinceDate;
        });
      }
    }

    // 0b. IDs filter (only fetch specific requested IDs)
    if (filter.ids && filter.ids.length > 0) {
      const idSet = new Set(filter.ids);
      list = list.filter(q => idSet.has(q.id));
    }

    // 0c. Exclude IDs filter (don't fetch questions already in local storage)
    if (filter.excludeIds && filter.excludeIds.length > 0) {
      const excludeSet = new Set(filter.excludeIds);
      list = list.filter(q => !excludeSet.has(q.id));
    }

    // 1. Class filter
    if (filter.class) {
      list = list.filter(q => q.class === Number(filter.class));
    }

    // 2. Chapter filter (single or multi-select array)
    if (filter.chapters && filter.chapters.length > 0) {
      const allowed = filter.chapters.map(c => c.trim().toLowerCase());
      list = list.filter(q => allowed.includes(q.chapter.toLowerCase()));
    } else if (filter.chapter) {
      const normChap = filter.chapter.trim().toLowerCase();
      list = list.filter(q => q.chapter.toLowerCase() === normChap);
    }

    // 3. Tag filter
    if (filter.tag && filter.tag !== 'all') {
      const normTag = filter.tag.trim().toLowerCase();
      if (normTag === 'undone' || normTag === 'unattempted') {
        list = list.filter(q => (q.timesAttempted || 0) === 0);
      } else if (normTag === 'less_than_4' || normTag === 'less than 4 times' || normTag === 'lt4') {
        list = list.filter(q => (q.timesAttempted || 0) < 4);
      } else {
        list = list.filter(q => Array.isArray(q.tags) && q.tags.map(t => t.toLowerCase()).includes(normTag));
      }
    }

    // 4. Unattempted / Undone filter
    if (filter.unattempted !== undefined) {
      if (filter.unattempted) {
        list = list.filter(q => (q.timesAttempted || 0) === 0);
      } else {
        list = list.filter(q => (q.timesAttempted || 0) > 0);
      }
    }

    // 5. Max attempts filter (e.g. less than 4 times)
    if (filter.maxAttempts !== undefined) {
      list = list.filter(q => (q.timesAttempted || 0) < filter.maxAttempts!);
    }

    // 6. Bookmarked filter
    if (filter.bookmarked !== undefined) {
      list = list.filter(q => !!q.bookmarked === filter.bookmarked);
    }

    // 7. Previously Wrong filter
    if (filter.previouslyWrong !== undefined) {
      list = list.filter(q => !!q.previouslyWrong === filter.previouslyWrong);
    }

    // 8. Free text search
    if (filter.search && filter.search.trim()) {
      const query = filter.search.trim().toLowerCase();
      list = list.filter(
        q =>
          q.question.toLowerCase().includes(query) ||
          q.chapter.toLowerCase().includes(query) ||
          q.sourceText.toLowerCase().includes(query) ||
          (q.explanation && q.explanation.toLowerCase().includes(query)) ||
          q.tags.some(t => t.toLowerCase().includes(query)),
      );
    }

    // 9. Randomization
    if (filter.randomize) {
      list = list.sort(() => Math.random() - 0.5);
    }

    const total = list.length;
    const offset = filter.offset || 0;
    const limit = filter.limit !== undefined ? filter.limit : 50;

    const paged = limit > 0 ? list.slice(offset, offset + limit) : list.slice(offset);
    return { total, questions: paged };
  }

  async getById(id: string): Promise<StoredQuestion | null> {
    const all = await this.loadAllQuestions();
    const found = all.find(q => q.id === id);
    if (found) return found;

    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('questions').doc(id).get();
    if (!doc.exists) return null;
    const stateDoc = await db.collection('questionState').doc(id).get().catch(() => null);
    const state = stateDoc?.exists ? stateDoc.data() : null;

    const data = doc.data() as StoredQuestion;
    return {
      ...data,
      bookmarked: state ? !!state.bookmarked : data.tags?.includes('bookmarked') || false,
      previouslyWrong: state ? !!state.previouslyWrong : data.tags?.includes('previously_wrong') || false,
      timesAttempted: state?.timesAttempted || 0,
      timesWrong: state?.timesWrong || 0,
    };
  }

  async deleteQuestion(id: string): Promise<boolean> {
    const db = this.firebaseService.getFirestore();
    const batch = db.batch();
    batch.delete(db.collection('questions').doc(id));
    batch.delete(db.collection('questionState').doc(id));
    await batch.commit();
    this.invalidateCache();
    return true;
  }
}
