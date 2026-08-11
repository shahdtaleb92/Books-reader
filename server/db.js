import Database from 'better-sqlite3';
import { existsSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

console.log('[db] initializing...');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.FLY_APP_NAME ? '/data' : join(__dirname, '..', 'data');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = join(DATA_DIR, 'books.db');

// Clean up WAL/SHM files that cause issues on Fly.io
for (const ext of ['-wal', '-shm']) {
  try { unlinkSync(dbPath + ext); } catch { /* ignore */ }
}

function openDatabase() {
  try {
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    if (process.env.FLY_APP_NAME) {
      db.pragma('journal_mode = DELETE');
    } else {
      db.pragma('journal_mode = WAL');
    }
    db.prepare('SELECT 1').get();
    return db;
  } catch (e) {
    console.error('[db] corrupt or unusable, recreating:', e.message);
    try { unlinkSync(dbPath); } catch { /* ignore */ }
    try { unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    if (process.env.FLY_APP_NAME) {
      db.pragma('journal_mode = DELETE');
    } else {
      db.pragma('journal_mode = WAL');
    }
    return db;
  }
}

const db = openDatabase();

// If the disk is full, purge audio BLOBs (the biggest space consumer) and
// VACUUM to reclaim space before running schema setup. This lets the server
// recover without manual intervention.
function ensureDiskSpace() {
  try {
    db.exec('SELECT 1');
  } catch (e) {
    if (e.code !== 'SQLITE_FULL') throw e;
    console.warn('[db] disk full — purging audio data to reclaim space...');
    try {
      db.prepare('DELETE FROM audio').run();
      db.exec('VACUUM');
      console.log('[db] audio purged, disk space reclaimed');
    } catch (e2) {
      console.error('[db] could not recover from full disk:', e2.message);
      console.error('[db] deleting database and starting fresh');
      db.close();
      try { unlinkSync(dbPath); } catch { /* ignore */ }
      return openDatabase();
    }
  }
  return db;
}

let activeDb = ensureDiskSpace();

// Log DB size for visibility
try {
  const sz = statSync(dbPath).size;
  console.log(`[db] database size: ${(sz / 1024 / 1024).toFixed(1)} MB`);
} catch { /* ignore */ }

// Wrap schema creation so a SQLITE_FULL error triggers recovery
function runSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      passcode_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'pdf',
      total_pages INTEGER DEFAULT 0,
      last_page INTEGER DEFAULT 0,
      extraction_done INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      extracted_text TEXT DEFAULT '',
      UNIQUE(book_id, page_number)
    );

    CREATE TABLE IF NOT EXISTS audio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      voice_name TEXT NOT NULL,
      audio_data BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_id, page_number, voice_name)
    );
  `);
}

try {
  runSchema(activeDb);
} catch (e) {
  if (e.code === 'SQLITE_FULL') {
    console.warn('[db] disk full during schema setup — purging audio and retrying...');
    try {
      // Audio table might already exist from a previous deploy
      activeDb.prepare('DELETE FROM audio').run();
      activeDb.exec('VACUUM');
      console.log('[db] audio purged, retrying schema...');
      runSchema(activeDb);
    } catch (e2) {
      console.error('[db] cannot recover — dropping DB and starting fresh');
      activeDb.close();
      try { unlinkSync(dbPath); } catch { /* ignore */ }
      activeDb = openDatabase();
      runSchema(activeDb);
    }
  } else {
    throw e;
  }
}

// Migrations for existing databases
try {
  const columns = activeDb.prepare("PRAGMA table_info(books)").all().map(c => c.name);
  if (!columns.includes('source_type')) {
    activeDb.exec("ALTER TABLE books ADD COLUMN source_type TEXT NOT NULL DEFAULT 'pdf'");
  }
  if (!columns.includes('last_page')) {
    activeDb.exec("ALTER TABLE books ADD COLUMN last_page INTEGER DEFAULT 0");
  }
  if (!columns.includes('user_id')) {
    activeDb.exec("ALTER TABLE books ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  }
} catch (e) { console.log('[db] books migration skipped:', e?.message || 'fresh'); }

try {
  const audioCols = activeDb.prepare("PRAGMA table_info(audio)").all().map(c => c.name);
  if (!audioCols.includes('chunk_timings')) {
    activeDb.exec("ALTER TABLE audio ADD COLUMN chunk_timings TEXT DEFAULT ''");
  }
} catch (e) { console.log('[db] audio migration skipped:', e?.message || 'fresh'); }

console.log('[db] ready');

export default activeDb;
