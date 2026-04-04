import { Router } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { existsSync, unlinkSync, readFileSync } from 'fs';
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
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'));
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

const router = Router();

// List all books
router.get('/', (req, res) => {
  const books = db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
  res.json(books);
});

// Upload a PDF or DOCX file
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const title = req.body.title || req.file.originalname.replace(/\.[^.]+$/, '');
  const isDocx = req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isDocx) {
    try {
      const filepath = join(UPLOADS_DIR, req.file.filename);
      const buffer = readFileSync(filepath);
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();

      if (!text) {
        unlinkSync(filepath);
        return res.status(400).json({ error: 'No text found in DOCX file' });
      }

      // Split text into pages (~2000 chars each for readability)
      const pageSize = 2000;
      const pages = [];
      for (let i = 0; i < text.length; i += pageSize) {
        pages.push(text.substring(i, i + pageSize));
      }

      const bookResult = db.prepare(
        'INSERT INTO books (title, filename, filepath, source_type, total_pages, extraction_done) VALUES (?, ?, ?, ?, ?, 1)'
      ).run(title, req.file.originalname, req.file.filename, 'docx', pages.length);

      const upsert = db.prepare(
        'INSERT INTO pages (book_id, page_number, extracted_text) VALUES (?, ?, ?) ON CONFLICT(book_id, page_number) DO UPDATE SET extracted_text = excluded.extracted_text'
      );
      const insertMany = db.transaction((bookId, pagesArr) => {
        pagesArr.forEach((pageText, i) => upsert.run(bookId, i, pageText));
      });
      insertMany(bookResult.lastInsertRowid, pages);

      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookResult.lastInsertRowid);
      return res.status(201).json(book);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to process DOCX: ' + e.message });
    }
  }

  // PDF upload
  const result = db.prepare(
    'INSERT INTO books (title, filename, filepath, source_type, total_pages) VALUES (?, ?, ?, ?, ?)'
  ).run(title, req.file.originalname, req.file.filename, 'pdf', parseInt(req.body.totalPages) || 0);

  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(book);
});

// Create book from plain text
router.post('/text', (req, res) => {
  const { title, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const bookTitle = title || 'نص ملصوق';
  const pageSize = 2000;
  const pages = [];
  for (let i = 0; i < text.length; i += pageSize) {
    pages.push(text.substring(i, i + pageSize));
  }

  const result = db.prepare(
    'INSERT INTO books (title, filename, filepath, source_type, total_pages, extraction_done) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(bookTitle, '', '', 'text', pages.length);

  const upsert = db.prepare(
    'INSERT INTO pages (book_id, page_number, extracted_text) VALUES (?, ?, ?) ON CONFLICT(book_id, page_number) DO UPDATE SET extracted_text = excluded.extracted_text'
  );
  const insertMany = db.transaction((bookId, pagesArr) => {
    pagesArr.forEach((pageText, i) => upsert.run(bookId, i, pageText));
  });
  insertMany(result.lastInsertRowid, pages);

  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(book);
});

// Create book from URL
router.post('/url', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BooksReader/1.0)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch URL: ${response.status}` });
    }

    const html = await response.text();

    // Strip HTML tags, decode entities, extract text
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text || text.length < 10) {
      return res.status(400).json({ error: 'No meaningful text found at this URL' });
    }

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

    const pageSize = 2000;
    const pages = [];
    for (let i = 0; i < text.length; i += pageSize) {
      pages.push(text.substring(i, i + pageSize));
    }

    const result = db.prepare(
      'INSERT INTO books (title, filename, filepath, source_type, total_pages, extraction_done) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(pageTitle, url, '', 'url', pages.length);

    const upsert = db.prepare(
      'INSERT INTO pages (book_id, page_number, extracted_text) VALUES (?, ?, ?) ON CONFLICT(book_id, page_number) DO UPDATE SET extracted_text = excluded.extracted_text'
    );
    const insertMany = db.transaction((bookId, pagesArr) => {
      pagesArr.forEach((pageText, i) => upsert.run(bookId, i, pageText));
    });
    insertMany(result.lastInsertRowid, pages);

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(book);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch URL: ' + e.message });
  }
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

  // Delete file if exists
  if (book.filepath) {
    const filepath = join(UPLOADS_DIR, book.filepath);
    if (existsSync(filepath)) {
      unlinkSync(filepath);
    }
  }

  db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Serve PDF file
router.get('/:id/pdf', (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  if (book.source_type !== 'pdf') return res.status(400).json({ error: 'Not a PDF book' });

  const filepath = join(UPLOADS_DIR, book.filepath);
  if (!existsSync(filepath)) {
    return res.status(404).json({ error: 'PDF file not found on disk' });
  }

  res.sendFile(filepath);
});

// Save reading position
router.put('/:id/position', (req, res) => {
  const { page } = req.body;
  if (typeof page !== 'number') {
    return res.status(400).json({ error: 'page number is required' });
  }
  db.prepare('UPDATE books SET last_page = ? WHERE id = ?').run(page, req.params.id);
  res.json({ success: true });
});

// Get all pages text for a book
router.get('/:id/pages', (req, res) => {
  const pages = db
    .prepare('SELECT page_number, extracted_text FROM pages WHERE book_id = ? ORDER BY page_number')
    .all(req.params.id);

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

  if (totalPages) {
    db.prepare('UPDATE books SET total_pages = ?, extraction_done = 1 WHERE id = ?').run(
      totalPages, req.params.id
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

// Get saved audio for a page
router.get('/:id/audio/:pageNum', (req, res) => {
  const voice = req.query.voice;
  if (!voice) return res.status(400).json({ error: 'voice query param required' });

  const row = db.prepare(
    'SELECT audio_data FROM audio WHERE book_id = ? AND page_number = ? AND voice_name = ?'
  ).get(req.params.id, req.params.pageNum, voice);

  if (!row) return res.status(404).json({ error: 'No saved audio' });

  res.set('Content-Type', 'audio/wav');
  res.send(row.audio_data);
});

// Save audio for a page
router.post('/:id/audio/:pageNum', (req, res) => {
  const { voice } = req.query;
  if (!voice) return res.status(400).json({ error: 'voice query param required' });

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const audioData = Buffer.concat(chunks);
    if (audioData.length === 0) {
      return res.status(400).json({ error: 'No audio data' });
    }

    db.prepare(`
      INSERT INTO audio (book_id, page_number, voice_name, audio_data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(book_id, page_number, voice_name) DO UPDATE SET audio_data = excluded.audio_data, created_at = CURRENT_TIMESTAMP
    `).run(req.params.id, req.params.pageNum, voice, audioData);

    res.json({ success: true });
  });
});

// Check which pages have saved audio for a given voice
router.get('/:id/audio', (req, res) => {
  const voice = req.query.voice;
  if (!voice) return res.status(400).json({ error: 'voice query param required' });

  const rows = db.prepare(
    'SELECT page_number FROM audio WHERE book_id = ? AND voice_name = ?'
  ).all(req.params.id, voice);

  res.json(rows.map(r => r.page_number));
});

export default router;
