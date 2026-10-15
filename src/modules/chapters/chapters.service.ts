import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';
import { CANONICAL_CHAPTERS, CanonicalChapter } from './data/canonical-chapters.js';

@Injectable()
export class ChaptersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChaptersService.name);

  constructor(private readonly firebaseService: FirebaseAdminService) {}

  async onApplicationBootstrap() {
    await this.seedChaptersIfEmpty();
  }

  /**
   * Seeds the 32 canonical NCERT Biology chapters into Firestore collection `chapters`
   * (Class 11: 1-19, Class 12: 20-32). Idempotent.
   */
  async seedChapters(): Promise<{ count: number; chapters: CanonicalChapter[] }> {
    const db = this.firebaseService.getFirestore();
    const batch = db.batch();

    for (const chapter of CANONICAL_CHAPTERS) {
      const docRef = db.collection('chapters').doc(chapter.id);
      batch.set(
        docRef,
        {
          id: chapter.id,
          name: chapter.name,
          class: chapter.class,
          order: chapter.order,
          subject: chapter.subject,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    await batch.commit();
    this.logger.log(`Seeded ${CANONICAL_CHAPTERS.length} canonical chapters into Firestore.`);
    return { count: CANONICAL_CHAPTERS.length, chapters: CANONICAL_CHAPTERS };
  }

  private async seedChaptersIfEmpty(): Promise<void> {
    try {
      const db = this.firebaseService.getFirestore();
      const snapshot = await db.collection('chapters').get();
      if (snapshot.empty) {
        this.logger.log('Chapters collection is empty. Auto-seeding canonical reference chapters...');
        await this.seedChapters();
      }
    } catch (err: any) {
      this.logger.warn(`Could not verify/seed chapters on startup: ${err.message}`);
    }
  }

  /**
   * Retrieves chapters, optionally filtered by class (11 or 12), ordered by continuous canonical order.
   */
  async getAll(classFilter?: number): Promise<CanonicalChapter[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db.collection('chapters').get();

    let list: CanonicalChapter[] = [];
    if (!snapshot.empty) {
      snapshot.docs.forEach(doc => {
        list.push(doc.data() as CanonicalChapter);
      });
    } else {
      // Fallback to in-code canonical list if DB was just cleared
      list = [...CANONICAL_CHAPTERS];
    }

    if (classFilter === 11 || classFilter === 12) {
      list = list.filter(c => c.class === classFilter);
    }

    return list.sort((a, b) => a.order - b.order);
  }

  async getById(id: string): Promise<CanonicalChapter | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('chapters').doc(id).get();
    if (doc.exists) {
      return doc.data() as CanonicalChapter;
    }
    return CANONICAL_CHAPTERS.find(c => c.id === id) || null;
  }
}
