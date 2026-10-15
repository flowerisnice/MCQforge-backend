import { Injectable, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';
import { CANONICAL_CHAPTERS } from '../chapters/data/canonical-chapters.js';

export interface AnalyticsOverview {
  currentStreak: number;
  longestStreak: number;
  totalTests: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  overallAccuracy: number;
  totalTimeSeconds: number;
  srsBreakdown: {
    totalTracked: number;
    learning: number;
    reviewing: number;
    mastered: number;
    dueToday: number;
  };
  recentTests: Array<{
    testId: string;
    mode: string;
    score: number;
    maxScore: number;
    accuracy: number;
    completedAt: string;
    totalQuestions: number;
  }>;
  accuracyTrend: Array<{
    date: string;
    accuracy: number;
    score: number;
  }>;
}

export interface ChapterHeatmapItem {
  id: string;
  name: string;
  order: number;
  class: 11 | 12;
  totalQuestionsInBank: number;
  totalAttempted: number;
  totalCorrect: number;
  accuracy: number;
  status: 'mastered' | 'proficient' | 'needs_practice' | 'unattempted';
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly firebaseService: FirebaseAdminService) {}

  async getOverview(): Promise<AnalyticsOverview> {
    const db = this.firebaseService.getFirestore();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Fetch metadata / aggregate stats
    const statsDoc = await db.collection('meta').doc('stats').get();
    const statsData = statsDoc.exists ? statsDoc.data() : {};

    // 2. Fetch all completed test records to compute overall aggregates
    const testsSnap = await db.collection('tests').orderBy('completedAt', 'desc').get();
    const tests = testsSnap.docs.map(doc => doc.data());

    let totalTests = tests.length;
    let totalQuestionsAttempted = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalSkipped = 0;
    let totalTimeSeconds = 0;

    for (const t of tests) {
      totalQuestionsAttempted += t.answeredCount || (t.correctCount || 0) + (t.wrongCount || 0);
      totalCorrect += t.correctCount || 0;
      totalWrong += t.wrongCount || 0;
      totalSkipped += t.skippedCount || 0;
      totalTimeSeconds += t.totalTimeSeconds || 0;
    }

    const overallAccuracy =
      totalQuestionsAttempted > 0 ? Math.round((totalCorrect / totalQuestionsAttempted) * 100) : 0;

    // 3. Fetch questionState to analyze Spaced Repetition queue
    const statesSnap = await db.collection('questionState').get();
    let totalTracked = statesSnap.docs.length;
    let learning = 0;
    let reviewing = 0;
    let mastered = 0;
    let dueToday = 0;

    for (const doc of statesSnap.docs) {
      const data = doc.data();
      const srsLevel = data.srsLevel || 0;
      const dueDate = data.srsDueDate;

      if (srsLevel <= 1) {
        learning++;
      } else if (srsLevel <= 3) {
        reviewing++;
      } else {
        mastered++;
      }

      if (dueDate && dueDate <= nowIso) {
        dueToday++;
      }
    }

    // 4. Recent tests
    const recentTests = tests.slice(0, 5).map(t => ({
      testId: t.testId,
      mode: t.mode,
      score: t.score,
      maxScore: t.maxScore || t.totalQuestions,
      accuracy: t.accuracy,
      completedAt: t.completedAt,
      totalQuestions: t.totalQuestions,
    }));

    // 5. Accuracy trend (chronological)
    const accuracyTrend = tests
      .slice(0, 15)
      .reverse()
      .map(t => ({
        date: t.completedAt ? new Date(t.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
        accuracy: t.accuracy || 0,
        score: t.score || 0,
      }));

    return {
      currentStreak: statsData?.currentStreak || (totalTests > 0 ? 1 : 0),
      longestStreak: statsData?.longestStreak || (totalTests > 0 ? 1 : 0),
      totalTests,
      totalQuestionsAttempted,
      totalCorrect,
      totalWrong,
      totalSkipped,
      overallAccuracy,
      totalTimeSeconds,
      srsBreakdown: {
        totalTracked,
        learning,
        reviewing,
        mastered,
        dueToday,
      },
      recentTests,
      accuracyTrend,
    };
  }

  async getChapterHeatmap(classFilter?: 11 | 12): Promise<ChapterHeatmapItem[]> {
    const db = this.firebaseService.getFirestore();

    // 1. Get question counts per chapter in question bank
    const questionsSnap = await db.collection('questions').get();
    const bankChapterCounts: Record<string, number> = {};
    for (const doc of questionsSnap.docs) {
      const q = doc.data();
      const ch = q.chapter;
      if (ch) {
        bankChapterCounts[ch] = (bankChapterCounts[ch] || 0) + 1;
      }
    }

    // 2. Get test performance aggregated per chapter
    const testsSnap = await db.collection('tests').get();
    const chapterPerformance: Record<string, { total: number; correct: number }> = {};

    for (const doc of testsSnap.docs) {
      const t = doc.data();
      const breakdown = t.chapterBreakdown || {};
      for (const [chName, stats] of Object.entries<any>(breakdown)) {
        if (!chapterPerformance[chName]) {
          chapterPerformance[chName] = { total: 0, correct: 0 };
        }
        chapterPerformance[chName].total += stats.total || 0;
        chapterPerformance[chName].correct += stats.correct || 0;
      }
    }

    // 3. Map canonical chapters
    let chapters = CANONICAL_CHAPTERS;
    if (classFilter) {
      chapters = chapters.filter(c => c.class === classFilter);
    }

    return chapters.map(ch => {
      const perf = chapterPerformance[ch.name] || { total: 0, correct: 0 };
      const accuracy = perf.total > 0 ? Math.round((perf.correct / perf.total) * 100) : 0;

      let status: ChapterHeatmapItem['status'] = 'unattempted';
      if (perf.total > 0) {
        if (accuracy >= 80) status = 'mastered';
        else if (accuracy >= 60) status = 'proficient';
        else status = 'needs_practice';
      }

      return {
        id: ch.id,
        name: ch.name,
        order: ch.order,
        class: ch.class,
        totalQuestionsInBank: bankChapterCounts[ch.name] || 0,
        totalAttempted: perf.total,
        totalCorrect: perf.correct,
        accuracy,
        status,
      };
    });
  }

  async getSrsQueue(limit = 20): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const nowIso = new Date().toISOString();

    const statesSnap = await db
      .collection('questionState')
      .where('srsDueDate', '<=', nowIso)
      .limit(limit)
      .get();

    if (statesSnap.empty) {
      return [];
    }

    const qids = statesSnap.docs.map(d => d.id);
    const questions: any[] = [];

    // Fetch corresponding question docs in chunks of 10 for Firestore 'in' limitation
    for (let i = 0; i < qids.length; i += 10) {
      const chunk = qids.slice(i, i + 10);
      const qSnap = await db.collection('questions').where('__name__', 'in', chunk).get();
      for (const doc of qSnap.docs) {
        const stateDoc = statesSnap.docs.find(d => d.id === doc.id);
        questions.push({
          id: doc.id,
          ...doc.data(),
          srsState: stateDoc?.data(),
        });
      }
    }

    return questions;
  }
}
