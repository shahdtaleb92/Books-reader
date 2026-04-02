import { Router } from 'express';
import multer from 'multer';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.FLY_APP_NAME ? '/data/uploads' : join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
});

const router = Router();

// List all books
router.get('/', (req, res) => {
  const books = db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
  res.json(books);
});

// Upload a new book
router.post('/', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  const title = req.body.title || req.file.originalname.replace(/\.pdf$/i, '');
  const result = db.prepare(
    'INSERT INTO books (title, filename, filepath, total_pages) VALUES (?, ?, ?, ?)'
  ).run(title, req.file.originalname, req.file.filename, parseInt(req.body.totalPages) || 0);

  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(book);
});

// Get a single book
router.get('/:id', (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(book);
});

// Delete a book
router.delete('/:id', (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  // Delete PDF file
  const filepath = join(UPLOADS_DIR, book.filepath);
  if (existsSync(filepath)) {
    unlinkSync(filepath);
  }

  db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Serve PDF file
router.get('/:id/pdf', (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const filepath = join(UPLOADS_DIR, book.filepath);
  if (!existsSync(filepath)) {
    return res.status(404).json({ error: 'PDF file not found on disk' });
  }

  res.sendFile(filepath);
});

// Get all pages text for a book
router.get('/:id/pages', (req, res) => {
  const pages = db
    .prepare('SELECT page_number, extracted_text FROM pages WHERE book_id = ? ORDER BY page_number')
    .all(req.params.id);

  // Return as object { pageNumber: text }
  const texts = {};
  for (const p of pages) {
    texts[p.page_number] = p.extracted_text;
  }
  res.json(texts);
});

// Get a single page text
router.get('/:id/pages/:pageNum', (req, res) => {
  const page = db
    .prepare('SELECT extracted_text FROM pages WHERE book_id = ? AND page_number = ?')
    .get(req.params.id, req.params.pageNum);

  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json({ text: page.extracted_text });
});

// Bulk save extracted texts for all pages
router.post('/:id/extract', (req, res) => {
  const { texts, totalPages } = req.body;
  if (!texts || typeof texts !== 'object') {
    return res.status(400).json({ error: 'texts object is required' });
  }

  const upsert = db.prepare(`
    INSERT INTO pages (book_id, page_number, extracted_text)
    VALUES (?, ?, ?)
    ON CONFLICT(book_id, page_number) DO UPDATE SET extracted_text = excluded.extracted_text
  `);

  const insertMany = db.transaction((bookId, textsObj) => {
    for (const [pageNum, text] of Object.entries(textsObj)) {
      upsert.run(bookId, parseInt(pageNum), text);
    }
  });

  insertMany(req.params.id, texts);

  // Mark extraction as done
  if (totalPages) {
    db.prepare('UPDATE books SET total_pages = ?, extraction_done = 1 WHERE id = ?').run(
      totalPages,
      req.params.id
    );
  } else {
    db.prepare('UPDATE books SET extraction_done = 1 WHERE id = ?').run(req.params.id);
  }

  res.json({ success: true });
});

// Save a single page text
router.put('/:id/pages/:pageNum', (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'text string is required' });
  }

  db.prepare(`
    INSERT INTO pages (book_id, page_number, extracted_text)
    VALUES (?, ?, ?)
    ON CONFLICT(book_id, page_number) DO UPDATE SET extracted_text = excluded.extracted_text
  `).run(req.params.id, req.params.pageNum, text);

  res.json({ success: true });
});

export default router;
