import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';
import { SubmitTestDto, TestResultSummary, QuestionResultItem } from './dto/submit-test.dto.js';
import * as crypto from 'crypto';

const SRS_INTERVALS_DAYS = [1, 3, 7, 21, 60];

@Injectable()
export class TestsService {
  private readonly logger = new Logger(TestsService.name);

  constructor(private readonly firebaseService: FirebaseAdminService) {}

  /**
   * Submits, grades, records test session, updates questionState, SRS queue, and stats.
   */
  async submitTest(dto: SubmitTestDto): Promise<TestResultSummary> {
    if (!dto.answers || dto.answers.length === 0) {
      throw new BadRequestException('Test submission must contain answers.');
    }

    const db = this.firebaseService.getFirestore();
    const testId = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = now.toISOString().split('T')[0];

    // 1. Fetch questions to evaluate answers
    const qidList = dto.answers.map(a => a.qid);
    const questionsMap = new Map<string, any>();
    const statesMap = new Map<string, any>();

    const [qSnap, stateSnap] = await Promise.all([
      db.collection('questions').get(),
      db.collection('questionState').get().catch(() => ({ docs: [] } as any)),
    ]);

    qSnap.docs.forEach(doc => {
      if (qidList.includes(doc.id)) {
        questionsMap.set(doc.id, doc.data());
      }
    });

    stateSnap.docs.forEach((doc: any) => {
      if (qidList.includes(doc.id)) {
        statesMap.set(doc.id, doc.data());
      }
    });

    // 2. Score the answers
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let negativeDeductions = 0;
    let score = 0;

    const chapterBreakdown: Record<string, { total: number; correct: number; wrong: number }> = {};
    const questionResults: QuestionResultItem[] = [];

    const stateUpdates: Array<{ qid: string; isCorrect: boolean; isSkipped: boolean }> = [];
    const questionTagUpdates: Array<{ qid: string; markPreviouslyWrong: boolean }> = [];

    for (const ans of dto.answers) {
      const q = questionsMap.get(ans.qid);
      if (!q) continue;

      const chapter = q.chapter || 'Unknown';
      if (!chapterBreakdown[chapter]) {
        chapterBreakdown[chapter] = { total: 0, correct: 0, wrong: 0 };
      }
      chapterBreakdown[chapter].total += 1;

      const isSkipped = ans.selectedAnswer === null || ans.selectedAnswer === undefined || ans.selectedAnswer === '';
      let isCorrect = false;

      if (isSkipped) {
        skippedCount++;
      } else {
        const normSelected = String(ans.selectedAnswer).trim().toLowerCase();
        const normCorrect = String(q.correctAnswer).trim().toLowerCase();

        isCorrect = normSelected === normCorrect;

        if (isCorrect) {
          correctCount++;
          score += 1;
          chapterBreakdown[chapter].correct += 1;
        } else {
          wrongCount++;
          chapterBreakdown[chapter].wrong += 1;
          if (dto.negativeMarking) {
            const deduction = dto.negativeMarkValue || 0.25;
            score -= deduction;
            negativeDeductions += deduction;
          }
        }
      }

      stateUpdates.push({ qid: ans.qid, isCorrect, isSkipped });
      if (!isSkipped) {
        questionTagUpdates.push({ qid: ans.qid, markPreviouslyWrong: !isCorrect });
      }

      questionResults.push({
        qid: ans.qid,
        question: q.question,
        options: q.options || [],
        selectedAnswer: ans.selectedAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        timeSpentSeconds: ans.timeSpentSeconds || 0,
        sourceText: q.sourceText,
        explanation: q.explanation,
        chapter: q.chapter,
        class: q.class,
        flagged: !!ans.flagged,
      });
    }

    const totalQuestions = questionResults.length;
    const answeredCount = correctCount + wrongCount;
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const averageTime = totalQuestions > 0 ? Math.round(dto.totalTimeSeconds / totalQuestions) : 0;

    const summary: TestResultSummary = {
      testId,
      mode: dto.mode,
      totalQuestions,
      answeredCount,
      correctCount,
      wrongCount,
      skippedCount,
      score: Math.max(0, parseFloat(score.toFixed(2))),
      maxScore: totalQuestions,
      accuracy,
      negativeMarking: !!dto.negativeMarking,
      negativeDeductions: parseFloat(negativeDeductions.toFixed(2)),
      totalTimeSeconds: dto.totalTimeSeconds,
      averageTimePerQuestion: averageTime,
      chapterBreakdown,
      questions: questionResults,
      completedAt: nowIso,
    };

    // 3. Batch commit test session doc and questionState updates
    const batch = db.batch();

    // Save test session
    const testDocRef = db.collection('tests').doc(testId);
    batch.set(testDocRef, summary);

    // Update questionState for each question
    for (const update of stateUpdates) {
      const stateRef = db.collection('questionState').doc(update.qid);
      const existing = statesMap.get(update.qid) || {
        timesAttempted: 0,
        timesCorrect: 0,
        timesWrong: 0,
        srsLevel: 0,
      };

      if (!update.isSkipped) {
        const newAttempted = (existing.timesAttempted || 0) + 1;
        const newCorrect = (existing.timesCorrect || 0) + (update.isCorrect ? 1 : 0);
        const newWrong = (existing.timesWrong || 0) + (!update.isCorrect ? 1 : 0);

        let newSrsLevel = existing.srsLevel || 0;
        let srsDays = 1;

        if (update.isCorrect) {
          newSrsLevel = Math.min(SRS_INTERVALS_DAYS.length - 1, newSrsLevel + 1);
          srsDays = SRS_INTERVALS_DAYS[newSrsLevel];
        } else {
          newSrsLevel = 0;
          srsDays = 1;
        }

        const srsDueDate = new Date(now.getTime() + srsDays * 24 * 60 * 60 * 1000).toISOString();

        batch.set(
          stateRef,
          {
            qid: update.qid,
            timesAttempted: newAttempted,
            timesCorrect: newCorrect,
            timesWrong: newWrong,
            previouslyWrong: !update.isCorrect,
            srsLevel: newSrsLevel,
            srsDueDate,
            lastAttemptedAt: nowIso,
          },
          { merge: true },
        );
      }
    }

    // Update previously_wrong tags on question documents
    for (const tagUp of questionTagUpdates) {
      const qRef = db.collection('questions').doc(tagUp.qid);
      const qDoc = questionsMap.get(tagUp.qid);
      if (qDoc) {
        const currentTags: string[] = qDoc.tags || [];
        let updatedTags: string[];
        if (tagUp.markPreviouslyWrong) {
          updatedTags = Array.from(new Set([...currentTags, 'previously_wrong']));
        } else {
          updatedTags = currentTags.filter(t => t.toLowerCase() !== 'previously_wrong');
        }
        batch.update(qRef, { tags: updatedTags });
      }
    }

    await batch.commit();

    // 4. Update aggregate stats (streak & counters)
    try {
      const statsRef = db.collection('meta').doc('stats');
      const statsSnap = await statsRef.get();
      const currentStats = statsSnap.exists ? statsSnap.data() : {};

      const lastDate = currentStats?.lastPracticedDate;
      let currentStreak = currentStats?.currentStreak || 0;
      let longestStreak = currentStats?.longestStreak || 0;

      if (!lastDate) {
        currentStreak = 1;
      } else if (lastDate === todayStr) {
        // Already practiced today, keep streak
      } else {
        const prev = new Date(lastDate);
        const diffDays = Math.round((now.getTime() - prev.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 1) {
          currentStreak += 1;
        } else {
          currentStreak = 1;
        }
      }

      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }

      const totalAttempts = (currentStats?.totalAttempts || 0) + totalQuestions;
      const totalTests = (currentStats?.totalTestsCompleted || 0) + 1;

      const accuracyHistory = currentStats?.accuracyTrend || [];
      accuracyHistory.push({
        date: todayStr,
        accuracy,
        attempts: totalQuestions,
        testId,
      });

      // Keep last 30 entries for dashboard trend
      const trimmedHistory = accuracyHistory.slice(-30);

      await statsRef.set(
        {
          currentStreak,
          longestStreak,
          lastPracticedDate: todayStr,
          totalAttempts,
          totalTestsCompleted: totalTests,
          accuracyTrend: trimmedHistory,
          lastUpdated: nowIso,
        },
        { merge: true },
      );
    } catch (err: any) {
      this.logger.warn(`Could not update stats: ${err.message}`);
    }

    this.logger.log(`Test ${testId} submitted. Score: ${summary.score}/${totalQuestions} (${accuracy}%)`);
    return summary;
  }

  /**
   * Retrieves test history sessions.
   */
  async getHistory(limitCount: number = 20): Promise<TestResultSummary[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db.collection('tests').get();

    const list: TestResultSummary[] = [];
    snapshot.docs.forEach(doc => {
      list.push(doc.data() as TestResultSummary);
    });

    return list
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, limitCount);
  }

  /**
   * Retrieves single test result by ID.
   */
  async getTestById(id: string): Promise<TestResultSummary> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('tests').doc(id).get();
    if (!doc.exists) {
      throw new NotFoundException(`Test session with ID ${id} not found.`);
    }
    return doc.data() as TestResultSummary;
  }
}
