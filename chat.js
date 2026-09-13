const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { RANKS } = require('../catalog');

const router = express.Router();

const listMessages = db.prepare(
  'SELECT id, user_email, body, ts FROM messages ORDER BY ts DESC LIMIT 100'
);
const insertMessage = db.prepare(
  'INSERT INTO messages (user_email, body, ts) VALUES (?, ?, ?)'
);
const allRanks = db.prepare('SELECT email, rank FROM accounts');

router.get('/', requireAuth, (req, res) => {
  const rankMap = {};
  allRanks.all().forEach((a) => { rankMap[a.email] = a.rank; });

  const rows = listMessages.all().reverse().map((m) => ({
    id: m.id,
    user: m.user_email,
    rank: rankMap[m.user_email] || 'membru',
    text: m.body,
    ts: m.ts
  }));
  res.json({ messages: rows });
});

router.post('/', requireAuth, (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'mesajul nu poate fi gol.' });

  const ts = Date.now();
  const info = insertMessage.run(req.user.email, text, ts);
  const message = { id: info.lastInsertRowid, user: req.user.email, rank: req.user.rank, text, ts };

  req.app.get('io').emit('chat:message', message);
  res.status(201).json({ message });
});

module.exports = router;
