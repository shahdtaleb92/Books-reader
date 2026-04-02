const BASE = '/api/books';

export async function fetchBooks() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch books');
  return res.json();
}

export async function uploadBook(file, totalPages) {
  const form = new FormData();
  form.append('pdf', file);
  form.append('title', file.name.replace(/\.pdf$/i, ''));
  if (totalPages) form.append('totalPages', totalPages);

  const res = await fetch(BASE, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Failed to upload book');
  return res.json();
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

export function getBookPdfUrl(bookId) {
  return `${BASE}/${bookId}/pdf`;
}
