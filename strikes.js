const express = require('express');
const db = require('../db');
const { requireAuth, requireRank } = require('../middleware/auth');
const { STRIKE_THRESHOLD, canIssueStrikes, canRemoveStrike } = require('../catalog');

const router = express.Router();

const getAccount = db.prepare('SELECT email, rank, blocked FROM accounts WHERE email = ?');
const setBlocked = db.prepare('UPDATE accounts SET blocked = 1 WHERE email = ?');
const listStrikes = db.prepare('SELECT * FROM strikes ORDER BY ts DESC');
const countStrikes = db.prepare('SELECT COUNT(*) AS n FROM strikes WHERE user_email = ?');
const insertStrike = db.prepare(
  'INSERT INTO strikes (user_email, reason, issued_by, ts) VALUES (?, ?, ?, ?)'
);
const getStrike = db.prepare('SELECT * FROM strikes WHERE id = ?');
const deleteStrike = db.prepare('DELETE FROM strikes WHERE id = ?');

// Toate rutele de strike-uri sunt vizibile doar pentru lider + the division.
router.use(requireAuth, requireRank(canIssueStrikes));

router.get('/', (req, res) => {
  res.json({ strikes: listStrikes.all(), threshold: STRIKE_THRESHOLD });
});

router.post('/', (req, res) => {
  const targetEmail = String(req.body.email || '').trim().toLowerCase();
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  if (!reason) return res.status(400).json({ error: 'motivul e obligatoriu.' });

  const target = getAccount.get(targetEmail);
  if (!target) return res.status(404).json({ error: 'cont inexistent.' });
  if (target.rank === 'lider') return res.status(400).json({ error: 'nu poți da strike unui cont de lider.' });
  if (targetEmail === req.user.email) return res.status(400).json({ error: 'nu îți poți da strike singur.' });

  const ts = Date.now();
  insertStrike.run(targetEmail, reason, req.user.email, ts);

  const total = countStrikes.get(targetEmail).n;
  let autoBlocked = false;
  if (total >= STRIKE_THRESHOLD && !target.blocked) {
    setBlocked.run(targetEmail);
    autoBlocked = true;
  }

  const io = req.app.get('io');
  if (io) io.emit('strikes:changed', { email: targetEmail });

  res.status(201).json({ ok: true, total, threshold: STRIKE_THRESHOLD, autoBlocked });
});

router.delete('/:id', requireRank(canRemoveStrike), (req, res) => {
  const row = getStrike.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'strike inexistent.' });
  deleteStrike.run(row.id);

  const io = req.app.get('io');
  if (io) io.emit('strikes:changed', { email: row.user_email });

  res.json({ ok: true });
});

module.exports = router;
