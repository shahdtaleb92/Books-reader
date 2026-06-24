import crypto from 'crypto';
import db from './db.js';

// Passcode hashing using scrypt (built into Node, no extra deps).
export function hashPasscode(passcode, salt) {
  return crypto.scryptSync(passcode, salt, 64).toString('hex');
}

export function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Constant-time comparison of two hex hashes of equal expected length.
export function verifyPasscode(passcode, salt, expectedHash) {
  const hash = hashPasscode(passcode, salt);
  if (hash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

// Express middleware: require a valid session token in `Authorization: Bearer`.
// Sets req.userId and req.token on success.
export function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'unauthorized' });

  req.userId = session.user_id;
  req.token = token;
  next();
}
