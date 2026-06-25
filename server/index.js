import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

console.log('[boot] starting server...');

let booksRouter, authRouter, db;
try {
  ({ default: db } = await import('./db.js'));
  ({ default: authRouter } = await import('./routes/auth.js'));
  ({ default: booksRouter } = await import('./routes/books.js'));
  console.log('[boot] routes loaded');
} catch (e) {
  console.error('[boot] FATAL: failed to load routes:', e);
  process.exit(1);
}

// On Fly.io, auto-purge audio older than 14 days on startup to prevent disk-full.
if (process.env.FLY_APP_NAME) {
  try {
    const result = db.prepare("DELETE FROM audio WHERE created_at < datetime('now', '-14 days')").run();
    if (result.changes > 0) {
      console.log(`[boot] purged ${result.changes} audio entries older than 14 days`);
      db.exec('VACUUM');
    }
    const DATA_DIR = '/data';
    const dbPath = join(DATA_DIR, 'books.db');
    const sz = statSync(dbPath).size;
    console.log(`[boot] database after cleanup: ${(sz / 1024 / 1024).toFixed(1)} MB`);
  } catch (e) { console.log('[boot] auto-cleanup skipped:', e.message); }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.FLY_APP_NAME ? '/data/uploads' : join(__dirname, '..', 'uploads');
const DIST_DIR = join(__dirname, '..', 'dist');

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);

// Serve static frontend in production
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*path}', (req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[boot] listening on http://0.0.0.0:${PORT}`);
});
