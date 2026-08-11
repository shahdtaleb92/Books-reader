# Arabic Books Reader — Functional Requirements Specification

A private, Arabic-first reading application. Users bring documents (PDF, Word, plain text,
or a web link), the system extracts the Arabic text, and each book can be read on a clean
right-to-left page and played aloud with word-by-word highlighting. This document specifies
the full functional scope of the system.

| | |
|---|---|
| **Product** | Arabic Books Reader |
| **Type** | Web app (installable / PWA) |
| **Stack** | React + Vite · Express · SQLite · Fly.io |
| **AI services** | Google Gemini — OCR (`gemini-2.5-flash`) + TTS (`gemini-2.5-pro-preview-tts`) |

---

## 1. System overview

The Arabic Books Reader lets a reader build a personal library of documents and consume them
as clean, readable Arabic text with optional narration. It removes the friction of reading
scanned PDFs and long articles on a phone: content is converted to selectable text, laid out
for comfortable RTL reading, and can be listened to hands-free with the current word
highlighted in time with the voice.

- **Who** — individual readers; each person has a private account and their own library on any device.
- **What** — import documents, read as RTL text, and play them aloud with synchronized highlighting.
- **Where** — runs in the browser and installs to the iOS/Android home screen as a web app.

The reader supplies their own Google Gemini API key, which powers two AI capabilities: **OCR**
(turning page images into Arabic text) and **text-to-speech** (narration). Book data lives on
the server, scoped privately to each account.

---

## 2. Architecture & context

```
 BROWSER (React)                 EXPRESS SERVER              SQLITE (durable volume)
 ┌────────────────────┐  HTTPS   ┌──────────────────┐        ┌───────────────────────┐
 │ Library & Reader UI │ ───────▶ │ Auth + sessions  │ ─────▶ │ users · sessions       │
 │ PDF render + OCR    │  +token  │ Book/page/audio  │        │ books · pages · audio  │
 │ TTS + highlighting  │          │ DOCX / URL import│        └───────────────────────┘
 │ IndexedDB cache     │          └──────────────────┘
 └─────────┬──────────┘
           │ OCR & TTS called directly from the browser with the user's key
           ▼
   GOOGLE GEMINI  (gemini-2.5-flash · gemini-2.5-pro-preview-tts)
```

The browser talks to the server for **data** (authenticated, per-user). It calls Gemini
directly for **AI** using the user's own API key.

---

## 3. Requirement conventions

Each requirement has a stable ID (`FR-<MODULE>-n`) and a MoSCoW priority. All requirements
listed are implemented in the current system.

- **MUST** — core to a correct, secure, usable product.
- **SHOULD** — important; the product is notably better with it.
- **COULD** — convenience / enhancement.

---

## 4. Accounts & authentication (`FR-AUTH`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-1 | Create an account with a username (≥ 2 chars) and passcode (≥ 4 chars). | MUST |
| FR-AUTH-2 | Log in with username + passcode; a session token is issued and sent on every request. | MUST |
| FR-AUTH-3 | Passcodes stored hashed (scrypt + per-user salt), compared in constant time; never plaintext. | MUST |
| FR-AUTH-4 | Usernames are unique (case-insensitive); duplicates rejected with a clear message. | MUST |
| FR-AUTH-5 | Log out; the session token is invalidated server-side. | SHOULD |
| FR-AUTH-6 | An invalid/expired token auto-signs-out the client back to the login screen. | SHOULD |
| FR-AUTH-7 | Sessions survive server restarts (stored on the durable volume), so a redeploy doesn't log users out. | SHOULD |

---

## 5. Privacy & data isolation (`FR-PRIV`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PRIV-1 | Every book, page, and audio item belongs to exactly one owner. | MUST |
| FR-PRIV-2 | A user's library and all reads are scoped to their own data only. | MUST |
| FR-PRIV-3 | A user cannot access another user's content by ID; foreign/unknown IDs both return "not found". | MUST |
| FR-PRIV-4 | Every content endpoint requires authentication. | MUST |
| FR-PRIV-5 | On first migration to accounts, the first registered user inherits any pre-existing books. | MUST |

---

## 6. Adding content — ingestion (`FR-LIB`)

```
 SOURCE                 EXTRACT                    STORE              LIBRARY
 PDF · DOCX  ────▶  PDF → images → OCR  ────▶  book + pages   ────▶  appears as
 TXT · paste        DOCX/URL → text            owned by user         a book card
 web URL            paginate
```

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LIB-1 | Upload a **PDF**: each page is rendered to an image, OCR'd to Arabic text, and saved. Page count is recorded. | MUST |
| FR-LIB-2 | Upload a **DOCX**: the server extracts the text and paginates it (~2000 chars/page). | SHOULD |
| FR-LIB-3 | Upload a **TXT** file or **paste text** from the clipboard to create a book. | SHOULD |
| FR-LIB-4 | Import from a **web URL**: the server fetches the page, strips markup to readable text, and paginates it. Blocked sites fall back through public proxies, then to a client-side capture. | COULD |
| FR-LIB-5 | Upload is robust: OCR errors on individual pages do not abort the import, and progress is shown per page. | SHOULD |
| FR-LIB-6 | File type is detected by extension as well as MIME type (so uploads work on iOS where MIME is often missing). Max upload 200 MB. | MUST |
| FR-LIB-7 | Browse the library as book cards (title, type badge, page count, date); search/filter by title. | SHOULD |

---

## 7. Text extraction — OCR (`FR-OCR`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-OCR-1 | Extract Arabic text from a page image using Google **Gemini `gemini-2.5-flash`**, with a prompt that preserves paragraph and line order and adds no commentary. | MUST |
| FR-OCR-2 | OCR runs several pages concurrently (batches of 3) to keep import fast. | SHOULD |
| FR-OCR-3 | A page with no saved text can be (re-)OCR'd on demand when it is opened. | SHOULD |
| FR-OCR-4 | The user's Gemini API key is entered in-app, stored only on the device, and never committed to the codebase. | MUST |

---

## 8. Reading & navigation (`FR-READ`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-READ-1 | Read a book as clean Arabic text, one page at a time, in a right-to-left layout with a reading font. | MUST |
| FR-READ-2 | Navigate pages via previous/next buttons, a page-number input, left/right swipe, and arrow keys — all with correct RTL direction. | MUST |
| FR-READ-3 | Show the current position as "page / total". | SHOULD |
| FR-READ-4 | Remember and restore the last page read; position saves are debounced and can't overwrite the restore. | SHOULD |
| FR-READ-5 | Adjust reading font size (0.8×–1.8×); the choice persists. | SHOULD |
| FR-READ-6 | Reading controls auto-hide for an immersive view and reappear on tap. | COULD |
| FR-READ-7 | A book opens using its stored page count, so it stays fully navigable even if the source PDF's images are unavailable. | MUST |
| FR-READ-8 | Opening a book uses saved text and does not re-render the whole PDF; page images are produced lazily only when a page needs re-OCR. | MUST |

---

## 9. Text editing (`FR-EDIT`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-EDIT-1 | Toggle an edit mode that shows the current page's text in an editable RTL text area. | SHOULD |
| FR-EDIT-2 | Save edited page text back to the server, replacing the stored text for that page. | SHOULD |

---

## 10. Text-to-speech & highlighting (`FR-TTS`)

```
 Page text  ──▶  Gemini TTS          ──▶  PCM → WAV     ──▶  Cache          ──▶  Play + highlight
 → chunks        2.5-pro-preview-tts       + chunk timings    server+offline      word-by-word
                 ar-XA · 12 voices
```

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TTS-1 | Play the current page aloud using Google **Gemini `gemini-2.5-pro-preview-tts`** (Arabic `ar-XA`), with a choice of 12 voices. | SHOULD |
| FR-TTS-2 | Highlight the word currently being spoken, kept in time with the audio using stored chunk timings (silent punctuation/diacritics are not counted toward timing). | SHOULD |
| FR-TTS-3 | Control playback: play, pause, resume, stop, and seek ±10 seconds. | SHOULD |
| FR-TTS-4 | Adjust playback speed (0.5×–2×) and a highlight-timing offset that takes effect live during playback; both persist. | COULD |
| FR-TTS-5 | Tap any word to start reading from that word. | COULD |
| FR-TTS-6 | Auto-advance: on finishing a page, automatically continue to the next page that has text. | COULD |
| FR-TTS-7 | Generated audio is saved (server + offline) with its timings and reused; upcoming pages are pre-generated during playback. | SHOULD |
| FR-TTS-8 | Regenerate a page's audio on demand (e.g. after editing its text). | COULD |

---

## 11. Offline & caching (`FR-CACHE`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CACHE-1 | Page text is cached in the browser (IndexedDB) so a book can be read again offline. | COULD |
| FR-CACHE-2 | Generated audio (with timings) is cached in the browser and reused without re-calling the API. | SHOULD |
| FR-CACHE-3 | If the server is unreachable, the reader falls back to cached text for a book. | COULD |

---

## 12. Data management (`FR-DATA`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DATA-1 | Delete a single book (with an in-app confirmation); its file and all pages/audio are removed. | MUST |
| FR-DATA-2 | "Delete my books" removes all of the user's books on the server and clears the local cache; they do not reappear on reload. | MUST |
| FR-DATA-3 | Logging out clears the local cache but preserves the user's books on the server for next login. | SHOULD |

---

## 13. Reliability & operations (`FR-OPS`)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-OPS-1 | A rendering crash is caught and shown as a friendly Arabic recovery screen (retry / back to library) instead of a blank page; saved data is untouched. | MUST |
| FR-OPS-2 | If the disk is full at startup, the server reclaims space (purge cached audio + compact), retries, and only as a last resort starts fresh — instead of crash-looping. | MUST |
| FR-OPS-3 | On the hosted deployment, startup auto-purges audio older than 14 days and compacts the database. | SHOULD |
| FR-OPS-4 | Database schema migrations are additive and non-destructive; a corrupt database is detected and recreated. | MUST |
| FR-OPS-5 | Startup logs each phase and the database size for diagnosability. | SHOULD |

---

## 14. Non-functional requirements (`NFR`)

| Quality | Requirement |
|---------|-------------|
| **Performance** | Books open from saved text without re-rendering PDFs; OCR runs 3 pages at a time; audio prefetches ahead; position/text saves are debounced. |
| **Security** | Hashed passcodes with per-user salt and constant-time checks; every request authenticated and ownership-checked; the Gemini key stays on the device and out of the repo. |
| **Usability (RTL)** | Fully right-to-left Arabic UI with correct arrow/swipe directions, large touch targets, loading skeletons, and in-app confirmations that are reliable on iOS. |
| **Accessibility** | Respects reduced-motion; ARIA labels and roles on controls; readable typography with adjustable size. |
| **Compatibility** | Installable as a home-screen web app (iOS/Android); handles iOS quirks (missing MIME types, native-dialog unreliability, IndexedDB behavior). |
| **Constraints** | Single-instance SQLite on a 1 GB volume; 200 MB max upload; relies on the user's own Gemini quota. |

---

## 15. Data model & dependencies

```
 sessions ──(token→user)──▶ users ──(owns)──▶ books ──┬──▶ pages  (page # · text)
                                                       └──▶ audio  (voice · wav · timings)
 Deleting a user or a book cascades to its pages and audio.
```

**Tables**

- `users` — `id`, `username`, `salt`, `passcode_hash`, `created_at`
- `sessions` — `token`, `user_id`, `created_at`
- `books` — `id`, `user_id`, `title`, `filename`, `filepath`, `source_type`, `total_pages`, `last_page`, `extraction_done`, `created_at`
- `pages` — `book_id`, `page_number`, `extracted_text`
- `audio` — `book_id`, `page_number`, `voice_name`, `audio_data` (WAV blob), `chunk_timings`, `created_at`

**External services** — Google Gemini: `gemini-2.5-flash` for OCR and `gemini-2.5-pro-preview-tts`
for narration, called with the user's own key.

**Key libraries** — pdf.js (PDF → images), mammoth (DOCX → text), better-sqlite3 (storage),
Express, React/Vite.

---

> **In one sentence:** the system takes any Arabic document, makes it clean readable text,
> reads it aloud with the spoken word highlighted, and keeps every user's library private
> and durable.
