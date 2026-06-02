const BASE = '/api/books';

export async function fetchBooks() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch books');
  return res.json();
}

export async function uploadBook(file, totalPages) {
  const form = new FormData();
  form.append('file', file);
  form.append('title', file.name.replace(/\.[^.]+$/, ''));
  if (totalPages) form.append('totalPages', totalPages);

  const res = await fetch(BASE, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Failed to upload book');
  return res.json();
}

export async function createTextBook(title, text) {
  const res = await fetch(`${BASE}/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text }),
  });
  if (!res.ok) throw new Error('Failed to create text book');
  return res.json();
}

export async function createBookFromUrl(url) {
  const res = await fetch(`${BASE}/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (res.ok) return res.json();
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || 'فشل جلب الرابط');
}

export async function fetchBook(id) {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error('Failed to fetch book');
  return res.json();
}

export async function deleteBook(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete book');
  return res.json();
}

export async function fetchPageTexts(bookId) {
  const res = await fetch(`${BASE}/${bookId}/pages`);
  if (!res.ok) throw new Error('Failed to fetch pages');
  return res.json();
}

export async function saveExtractedTexts(bookId, texts, totalPages) {
  const res = await fetch(`${BASE}/${bookId}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, totalPages }),
  });
  if (!res.ok) throw new Error('Failed to save texts');
  return res.json();
}

export async function savePageText(bookId, pageNum, text) {
  const res = await fetch(`${BASE}/${bookId}/pages/${pageNum}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to save page text');
  return res.json();
}

export async function saveReadingPosition(bookId, page) {
  const res = await fetch(`${BASE}/${bookId}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page }),
  });
  if (!res.ok) throw new Error('Failed to save position');
  return res.json();
}

export function getBookPdfUrl(bookId) {
  return `${BASE}/${bookId}/pdf`;
}

// Audio persistence
export async function fetchPageAudio(bookId, pageNum, voice) {
  const res = await fetch(`${BASE}/${bookId}/audio/${pageNum}?voice=${encodeURIComponent(voice)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch audio');

  let chunkTimings = null;
  const timingsHeader = res.headers.get('X-Chunk-Timings');
  if (timingsHeader) {
    try { chunkTimings = JSON.parse(timingsHeader); } catch {}
  }

  const blob = await res.blob();
  const audioUrl = URL.createObjectURL(blob);
  return { audioUrl, chunkTimings, blob };
}

export async function savePageAudio(bookId, pageNum, voice, blob, chunkTimings) {
  const headers = {};
  if (chunkTimings) {
    headers['X-Chunk-Timings'] = JSON.stringify(chunkTimings);
  }
  const res = await fetch(`${BASE}/${bookId}/audio/${pageNum}?voice=${encodeURIComponent(voice)}`, {
    method: 'POST',
    headers,
    body: blob,
  });
  if (!res.ok) throw new Error('Failed to save audio');
  return res.json();
}

export async function fetchSavedAudioPages(bookId, voice) {
  const res = await fetch(`${BASE}/${bookId}/audio?voice=${encodeURIComponent(voice)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function deletePageAudio(bookId, pageNum, voice) {
  const res = await fetch(`${BASE}/${bookId}/audio/${pageNum}?voice=${encodeURIComponent(voice)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete audio');
  return res.json();
}

export async function cleanupOldAudio() {
  const res = await fetch(`${BASE}/audio/cleanup`, { method: 'DELETE' });
  if (!res.ok) return { deleted: 0 };
  return res.json();
}
