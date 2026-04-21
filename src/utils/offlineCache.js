const DB_NAME = 'books-reader-offline';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio');
      }
      if (!db.objectStoreNames.contains('texts')) {
        db.createObjectStore('texts');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function makeAudioKey(bookId, pageNum, voice) {
  return `${bookId}:${pageNum}:${voice}`;
}

function makeTextKey(bookId, pageNum) {
  return `${bookId}:${pageNum}`;
}

export async function cacheAudio(bookId, pageNum, voice, blob) {
  try {
    const db = await openDB();
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').put(blob, makeAudioKey(bookId, pageNum, voice));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* IndexedDB not available */ }
}

export async function getCachedAudio(bookId, pageNum, voice) {
  try {
    const db = await openDB();
    const tx = db.transaction('audio', 'readonly');
    const req = tx.objectStore('audio').get(makeAudioKey(bookId, pageNum, voice));
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteCachedAudio(bookId, pageNum, voice) {
  try {
    const db = await openDB();
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').delete(makeAudioKey(bookId, pageNum, voice));
  } catch { /* ignore */ }
}

export async function cacheText(bookId, pageNum, text) {
  try {
    const db = await openDB();
    const tx = db.transaction('texts', 'readwrite');
    tx.objectStore('texts').put(text, makeTextKey(bookId, pageNum));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

export async function getCachedText(bookId, pageNum) {
  try {
    const db = await openDB();
    const tx = db.transaction('texts', 'readonly');
    const req = tx.objectStore('texts').get(makeTextKey(bookId, pageNum));
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheAllTexts(bookId, texts) {
  try {
    const db = await openDB();
    const tx = db.transaction('texts', 'readwrite');
    const store = tx.objectStore('texts');
    for (const [pageNum, text] of Object.entries(texts)) {
      store.put(text, makeTextKey(bookId, pageNum));
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

export async function getCachedTexts(bookId, totalPages) {
  try {
    const db = await openDB();
    const tx = db.transaction('texts', 'readonly');
    const store = tx.objectStore('texts');
    const texts = {};
    for (let i = 0; i < totalPages; i++) {
      const req = store.get(makeTextKey(bookId, i));
      await new Promise((resolve) => {
        req.onsuccess = () => {
          if (req.result) texts[i] = req.result;
          resolve();
        };
        req.onerror = () => resolve();
      });
    }
    return Object.keys(texts).length > 0 ? texts : null;
  } catch {
    return null;
  }
}
