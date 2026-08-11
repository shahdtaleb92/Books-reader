import { Router } from 'express';
import db from '../db.js';
import { hashPasscode, makeSalt, generateToken, verifyPasscode, authMiddleware } from '../auth.js';

const router = Router();

// Create a new account
router.post('/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const passcode = (req.body.passcode || '').trim();
  if (username.length < 2) {
    return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون حرفين على الأقل' });
  }
  if (passcode.length < 4) {
    return res.status(400).json({ error: 'الرمز يجب أن يكون 4 خانات على الأقل' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (existing) {
    return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
  }

  // Is this the very first account? If so it inherits any books that existed
  // before accounts were introduced (so the owner doesn't lose their library).
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

  const salt = makeSalt();
  const passcodeHash = hashPasscode(passcode, salt);
  const result = db.prepare(
    'INSERT INTO users (username, salt, passcode_hash) VALUES (?, ?, ?)'
  ).run(username, salt, passcodeHash);
  const userId = result.lastInsertRowid;

  if (userCount === 0) {
    db.prepare('UPDATE books SET user_id = ? WHERE user_id IS NULL').run(userId);
  }

  const token = generateToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.status(201).json({ token, username });
});

// Log in to an existing account
router.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const passcode = (req.body.passcode || '').trim();

  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!user || !verifyPasscode(passcode, user.salt, user.passcode_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو الرمز غير صحيح' });
  }

  const token = generateToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.json({ token, username: user.username });
});

// Log out (invalidate this session token)
router.post('/logout', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ success: true });
});

// Who am I (validate token, used on app load)
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  res.json({ username: user.username });
});

export default router;
