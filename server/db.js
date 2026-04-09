import Database from 'better-sqlite3';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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
    // Test if DB is usable
    db.pragma('foreign_keys = ON');
    if (process.env.FLY_APP_NAME) {
      db.pragma('journal_mode = DELETE');
    } else {
      db.pragma('journal_mode = WAL');
    }
    // Quick integrity check
    db.prepare('SELECT 1').get();
    return db;
  } catch (e) {
    console.error('Database corrupt or unusable, recreating:', e.message);
    // Delete corrupt database and start fresh
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

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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

// Migrations for existing databases
try {
  const columns = db.prepare("PRAGMA table_info(books)").all().map(c => c.name);
  if (!columns.includes('source_type')) {
    db.exec("ALTER TABLE books ADD COLUMN source_type TEXT NOT NULL DEFAULT 'pdf'");
  }
  if (!columns.includes('last_page')) {
    db.exec("ALTER TABLE books ADD COLUMN last_page INTEGER DEFAULT 0");
  }
} catch { /* fresh database, no migrations needed */ }

export default db;
