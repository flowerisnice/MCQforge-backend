import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';
import { TagInfo } from './dto/tag.dto.js';

export const RESERVED_TAGS = [
  'hard',
  'previously_wrong',
  'bookmarked',
  'important',
  'pyq',
  'diagram-based',
];

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(private readonly firebaseService: FirebaseAdminService) {}

  /**
   * Retrieves all unique tags across questions with count of associated questions.
   */
  async getAllTags(): Promise<TagInfo[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db.collection('questions').get();

    const counts = new Map<string, number>();

    // Pre-initialize reserved tags
    for (const reserved of RESERVED_TAGS) {
      counts.set(reserved, 0);
    }

    snapshot.docs.forEach(doc => {
      const tags: string[] = doc.data().tags || [];
      tags.forEach(t => {
        const norm = t.trim().toLowerCase();
        if (norm) {
          counts.set(norm, (counts.get(norm) || 0) + 1);
        }
      });
    });

    const list: TagInfo[] = Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
      isReserved: RESERVED_TAGS.includes(name),
    }));

    // Sort: reserved first, then by frequency descending
    return list.sort((a, b) => {
      if (a.isReserved && !b.isReserved) return -1;
      if (!a.isReserved && b.isReserved) return 1;
      return b.count - a.count;
    });
  }

  /**
   * Renames a tag across all questions in Firestore.
   */
  async renameTag(oldName: string, newName: string): Promise<{ updatedCount: number; message: string }> {
    const normOld = oldName.trim().toLowerCase();
    const normNew = newName.trim().toLowerCase();

    if (!normOld || !normNew) {
      throw new BadRequestException('Both oldName and newName are required.');
    }
    if (normOld === normNew) {
      return { updatedCount: 0, message: 'Tag names are identical. No changes made.' };
    }

    const db = this.firebaseService.getFirestore();
    const snapshot = await db.collection('questions').get();

    let updatedCount = 0;
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const tags: string[] = data.tags || [];
      if (tags.map(t => t.toLowerCase()).includes(normOld)) {
        const newTags = Array.from(
          new Set(tags.map(t => (t.toLowerCase() === normOld ? normNew : t))),
        );
        batch.update(doc.ref, { tags: newTags, updatedAt: new Date().toISOString() });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }

    this.logger.log(`Renamed tag "${normOld}" to "${normNew}" across ${updatedCount} questions.`);
    return { updatedCount, message: `Successfully renamed tag "${normOld}" to "${normNew}".` };
  }

  /**
   * Merges sourceTag into targetTag across all questions and removes sourceTag.
   */
  async mergeTags(sourceTag: string, targetTag: string): Promise<{ updatedCount: number; message: string }> {
    const normSource = sourceTag.trim().toLowerCase();
    const normTarget = targetTag.trim().toLowerCase();

    if (!normSource || !normTarget) {
      throw new BadRequestException('Both sourceTag and targetTag are required.');
    }
    if (normSource === normTarget) {
      return { updatedCount: 0, message: 'Source and target tags are identical. No merge performed.' };
    }

    const db = this.firebaseService.getFirestore();
    const snapshot = await db.collection('questions').get();

    let updatedCount = 0;
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const tags: string[] = data.tags || [];
      const hasSource = tags.map(t => t.toLowerCase()).includes(normSource);

      if (hasSource) {
        const filtered = tags.filter(t => t.toLowerCase() !== normSource);
        const merged = Array.from(new Set([...filtered, normTarget]));
        batch.update(doc.ref, { tags: merged, updatedAt: new Date().toISOString() });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }

    this.logger.log(`Merged tag "${normSource}" into "${normTarget}" across ${updatedCount} questions.`);
    return { updatedCount, message: `Successfully merged tag "${normSource}" into "${normTarget}".` };
  }
}
