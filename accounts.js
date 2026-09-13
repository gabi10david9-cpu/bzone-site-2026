const express = require('express');
const db = require('../db');
const { requireAuth, requireRank } = require('../middleware/auth');
const { RANKS, canManageAccounts } = require('../catalog');

const router = express.Router();

const allAccounts = db.prepare('SELECT email, rank, created_at, blocked FROM accounts');
const getAccount = db.prepare('SELECT email, rank, blocked FROM accounts WHERE email = ?');
const countLideri = db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE rank = 'lider'");
const setBlocked = db.prepare('UPDATE accounts SET blocked = ? WHERE email = ?');
const deleteAccountStmt = db.prepare('DELETE FROM accounts WHERE email = ?');

// Toate rutele de aici sunt strict pentru lider.
router.use(requireAuth, requireRank(canManageAccounts));

router.get('/', (req, res) => {
  const entries = allAccounts.all().sort((a, b) =>
    RANKS[b.rank].weight - RANKS[a.rank].weight || a.email.localeCompare(b.email)
  );
  res.json({ accounts: entries });
});

router.post('/:email/block', (req, res) => {
  const targetEmail = String(req.params.email).toLowerCase();
  const target = getAccount.get(targetEmail);
  if (!target) return res.status(404).json({ error: 'cont inexistent.' });
  if (targetEmail === req.user.email) {
    return res.status(400).json({ error: 'nu îți poți bloca propriul cont.' });
  }

  const blocked = req.body.blocked ? 1 : 0;
  if (blocked && target.rank === 'lider' && countLideri.get().n <= 1) {
    return res.status(400).json({ error: 'nu poți bloca ultimul cont de lider rămas.' });
  }

  setBlocked.run(blocked, targetEmail);
  res.json({ ok: true, email: targetEmail, blocked: !!blocked });
});

router.delete('/:email', (req, res) => {
  const targetEmail = String(req.params.email).toLowerCase();
  const target = getAccount.get(targetEmail);
  if (!target) return res.status(404).json({ error: 'cont inexistent.' });
  if (targetEmail === req.user.email) {
    return res.status(400).json({ error: 'nu îți poți șterge propriul cont din acest tab.' });
  }
  if (target.rank === 'lider' && countLideri.get().n <= 1) {
    return res.status(400).json({ error: 'nu poți șterge ultimul cont de lider rămas.' });
  }

  deleteAccountStmt.run(targetEmail);
  res.json({ ok: true, email: targetEmail });
});

module.exports = router;
