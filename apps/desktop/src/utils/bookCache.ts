/**
 * Desktop book cache utility
 * Caches book files, chapters, and chapter content to IndexedDB for offline reading.
 */

const DB_NAME = 'BookDockCache';
const DB_VERSION = 1;
const STORE_FILES = 'files';      // { bookId -> Blob }
const STORE_CHAPTERS = 'chapters'; // { bookId -> Array<{title, index}> }
const STORE_CONTENT = 'content';   // { `${bookId}:${chapterIndex}` -> string }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
        db.createObjectStore(STORE_CHAPTERS, { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains(STORE_CONTENT)) {
        db.createObjectStore(STORE_CONTENT, { keyPath: 'key' });
      }
    };
  });
}

async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// ── File cache (PDF blob etc.) ───────────────────────────────────────

export async function getCachedFile(bookId: string): Promise<Blob | null> {
  try {
    const store = await getStore(STORE_FILES);
    const req = store.get(bookId);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const result = req.result;
        resolve(result?.blob ? new Blob([result.blob], { type: result.type || 'application/octet-stream' }) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedFile(bookId: string, blob: Blob, type?: string): Promise<void> {
  try {
    const store = await getStore(STORE_FILES, 'readwrite');
    const arrayBuffer = await blob.arrayBuffer();
    const req = store.put({ bookId, blob: arrayBuffer, type: type || blob.type, cachedAt: Date.now() });
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to cache file:', e);
  }
}

export async function deleteCachedFile(bookId: string): Promise<void> {
  try {
    const store = await getStore(STORE_FILES, 'readwrite');
    const req = store.delete(bookId);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to delete cached file:', e);
  }
}

// ── Chapters cache ─────────────────────────────────────────────────────

export async function getCachedChapters(bookId: string): Promise<Array<{ title: string; index: number }> | null> {
  try {
    const store = await getStore(STORE_CHAPTERS);
    const req = store.get(bookId);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const result = req.result;
        resolve(result?.chapters || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedChapters(bookId: string, chapters: Array<{ title: string; index: number }>): Promise<void> {
  try {
    const store = await getStore(STORE_CHAPTERS, 'readwrite');
    const req = store.put({ bookId, chapters, cachedAt: Date.now() });
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to cache chapters:', e);
  }
}

// ── Chapter content cache ──────────────────────────────────────────────

export async function getCachedChapterContent(bookId: string, chapterIndex: number): Promise<string | null> {
  try {
    const store = await getStore(STORE_CONTENT);
    const req = store.get(`${bookId}:${chapterIndex}`);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const result = req.result;
        resolve(result?.content || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedChapterContent(bookId: string, chapterIndex: number, content: string): Promise<void> {
  try {
    const store = await getStore(STORE_CONTENT, 'readwrite');
    const req = store.put({ key: `${bookId}:${chapterIndex}`, content, cachedAt: Date.now() });
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to cache chapter content:', e);
  }
}

// ── Clear all cache for a book ─────────────────────────────────────────

export async function clearBookCache(bookId: string): Promise<void> {
  await Promise.all([
    deleteCachedFile(bookId),
    (async () => {
      try {
        const store = await getStore(STORE_CHAPTERS, 'readwrite');
        store.delete(bookId);
      } catch { /* ignore */ }
    })(),
    (async () => {
      try {
        const store = await getStore(STORE_CONTENT, 'readwrite');
        // Delete all content keys for this book
        const range = IDBKeyRange.bound(`${bookId}:`, `${bookId}:\xFF`);
        const req = store.openCursor(range);
        return new Promise<void>((resolve, reject) => {
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => reject(req.error);
        });
      } catch { /* ignore */ }
    })(),
  ]);
}
