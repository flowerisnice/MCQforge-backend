import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private firestoreInstance: admin.firestore.Firestore;
  private isMockMode = false;
  // In-memory store used when running without cloud credentials
  private mockCollections = new Map<string, Map<string, any>>();

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const firebase = (admin as any).default || admin;
    if (firebase.apps && firebase.apps.length > 0) {
      this.firestoreInstance = firebase.firestore();
      return;
    }

    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';
    const resolvedPath = path.resolve(process.cwd(), saPath);
    const parentPath = path.resolve(process.cwd(), '..', saPath);

    let credential: admin.credential.Credential | null = null;

    if (fs.existsSync(resolvedPath)) {
      this.logger.log(`Using Firebase service account from: ${resolvedPath}`);
      try {
        const sa = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        credential = firebase.credential?.cert(sa);
      } catch (err: any) {
        this.logger.error(`Failed to parse service account JSON: ${err.message}`);
      }
    } else if (fs.existsSync(parentPath)) {
      this.logger.log(`Using Firebase service account from parent: ${parentPath}`);
      try {
        const sa = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
        credential = firebase.credential?.cert(sa);
      } catch (err: any) {
        this.logger.error(`Failed to parse service account JSON: ${err.message}`);
      }
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      this.logger.log(`Using Firebase credentials from environment variables`);
      let projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

      // If projectId looks like a 40-char hex private_key_id or differs from email domain, infer true projectId
      if (clientEmail.includes('@') && clientEmail.includes('.iam.gserviceaccount.com')) {
        const inferred = clientEmail.split('@')[1].replace('.iam.gserviceaccount.com', '');
        if (!projectId || projectId.length > 35 || projectId !== inferred) {
          this.logger.log(`Auto-inferred Firebase project ID: ${inferred} from ${clientEmail}`);
          projectId = inferred;
        }
      }

      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      privateKey = privateKey.replace(/\\n/g, '\n');

      credential = firebase.credential?.cert({
        projectId: projectId || 'mcqforge-cd27a',
        clientEmail,
        privateKey,
      });
    }

    if (credential) {
      firebase.initializeApp({ credential });
      this.firestoreInstance = firebase.firestore();
      this.firestoreInstance.settings({ ignoreUndefinedProperties: true });
      this.logger.log('Firebase Admin initialized with Cloud Firestore credentials');
    } else if (process.env.FIRESTORE_EMULATOR_HOST) {
      firebase.initializeApp({ projectId: 'mcqforge-dev' });
      this.firestoreInstance = firebase.firestore();
      this.logger.log(`Firebase Admin connected to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    } else {
      this.isMockMode = true;
      this.logger.warn(
        '⚠️ No Firebase Service Account found (looked at service-account.json and env vars). ' +
        'Running with local In-Memory Firestore mock so endpoints and tests work immediately! ' +
        'To connect to your live Firebase project, place service-account.json in the backend directory.',
      );
    }
  }

  public get isMock(): boolean {
    return this.isMockMode;
  }

  public getFirestore(): admin.firestore.Firestore {
    if (this.firestoreInstance) {
      return this.firestoreInstance;
    }
    // Return mock interface matching Firestore operations
    return this.createMockFirestore() as any;
  }

  /**
   * Provides an in-memory mock implementation of Firestore collection/batch/transaction
   * so testing endpoints works seamlessly prior to service account configuration.
   */
  private createMockFirestore() {
    const self = this;

    const getColMap = (colName: string) => {
      if (!self.mockCollections.has(colName)) {
        self.mockCollections.set(colName, new Map());
      }
      return self.mockCollections.get(colName)!;
    };

    return {
      collection(colName: string) {
        return {
          doc(id?: string) {
            const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            return {
              id: docId,
              async set(data: any, options?: { merge?: boolean }) {
                const col = getColMap(colName);
                if (options?.merge && col.has(docId)) {
                  col.set(docId, { ...col.get(docId), ...data });
                } else {
                  col.set(docId, { id: docId, ...data });
                }
              },
              async get() {
                const col = getColMap(colName);
                const exists = col.has(docId);
                const data = exists ? col.get(docId) : undefined;
                return {
                  id: docId,
                  exists,
                  data: () => data,
                };
              },
              async delete() {
                const col = getColMap(colName);
                col.delete(docId);
              },
            };
          },
          where(field: string, op: string, value: any) {
            return {
              where(field2: string, op2: string, value2: any) {
                return this; // basic chaining
              },
              async get() {
                const col = getColMap(colName);
                const docs: any[] = [];
                for (const [id, item] of col.entries()) {
                  if (op === '==' && item[field] === value) {
                    docs.push({ id, data: () => item, exists: true });
                  } else if (op === 'array-contains' && Array.isArray(item[field]) && item[field].includes(value)) {
                    docs.push({ id, data: () => item, exists: true });
                  }
                }
                return {
                  empty: docs.length === 0,
                  size: docs.length,
                  docs,
                };
              },
            };
          },
          async get() {
            const col = getColMap(colName);
            const docs = Array.from(col.entries()).map(([id, item]) => ({
              id,
              data: () => item,
              exists: true,
            }));
            return {
              empty: docs.length === 0,
              size: docs.length,
              docs,
            };
          },
        };
      },
      batch() {
        const operations: Array<() => Promise<void>> = [];
        return {
          set(docRef: any, data: any, options?: any) {
            operations.push(() => docRef.set(data, options));
            return this;
          },
          update(docRef: any, data: any) {
            operations.push(() => docRef.set(data, { merge: true }));
            return this;
          },
          delete(docRef: any) {
            operations.push(() => docRef.delete());
            return this;
          },
          async commit() {
            for (const op of operations) {
              await op();
            }
          },
        };
      },
      async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
        const transaction = {
          async get(docRef: any) {
            return docRef.get();
          },
          set(docRef: any, data: any, options?: any) {
            return docRef.set(data, options);
          },
          update(docRef: any, data: any) {
            return docRef.set(data, { merge: true });
          },
          delete(docRef: any) {
            return docRef.delete();
          },
        };
        return updateFunction(transaction);
      },
    };
  }
}
