const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

const countAccounts = db.prepare('SELECT COUNT(*) AS n FROM accounts');
const getAccount = db.prepare('SELECT * FROM accounts WHERE email = ?');
const insertAccount = db.prepare(
  'INSERT INTO accounts (email, password_hash, rank, created_at) VALUES (?, ?, ?, ?)'
);

function signToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

router.post('/register', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email invalid.' });
  if (password.length < 6) return res.status(400).json({ error: 'parola trebuie să aibă minim 6 caractere.' });
  if (getAccount.get(email)) return res.status(409).json({ error: 'există deja un cont cu acest email.' });

  const rank = countAccounts.get().n === 0 ? 'lider' : 'membru';
  const passwordHash = await bcrypt.hash(password, 12);

  insertAccount.run(email, passwordHash, rank, Date.now());

  const token = signToken(email);
  res.status(201).json({ token, user: { email, rank } });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const account = getAccount.get(email);
  if (!account) return res.status(401).json({ error: 'cont inexistent. creează unul mai întâi.' });
  if (account.blocked) return res.status(403).json({ error: 'contul tău a fost blocat de conducere.' });

  const ok = await bcrypt.compare(password, account.password_hash);
  if (!ok) return res.status(401).json({ error: 'parolă incorectă.' });

  const token = signToken(email);
  res.json({ token, user: { email, rank: account.rank } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
