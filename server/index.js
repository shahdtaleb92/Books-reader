import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

console.log('[boot] starting server...');

let booksRouter, authRouter;
try {
  ({ default: authRouter } = await import('./routes/auth.js'));
  ({ default: booksRouter } = await import('./routes/books.js'));
  console.log('[boot] routes loaded');
} catch (e) {
  console.error('[boot] FATAL: failed to load routes:', e);
  process.exit(1);
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
