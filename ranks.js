const express = require('express');
const db = require('../db');
const { requireAuth, requireRank } = require('../middleware/auth');
const { RANKS, canViewMembersTab, canManageRanks } = require('../catalog');

const router = express.Router();

const allAccounts = db.prepare('SELECT email, rank FROM accounts');
const getAccount = db.prepare('SELECT email, rank FROM accounts WHERE email = ?');
const setRank = db.prepare('UPDATE accounts SET rank = ? WHERE email = ?');

// Tab-ul de membri e vizibil doar pentru lider și "the division".
router.get('/', requireAuth, requireRank(canViewMembersTab), (req, res) => {
  const entries = allAccounts.all().sort((a, b) =>
    RANKS[b.rank].weight - RANKS[a.rank].weight || a.email.localeCompare(b.email)
  );
  res.json({ ranks: entries });
});

// Schimbarea gradelor rămâne strict la lider (inclusiv "the division" nu are
// voie, ca să nu poată să se auto-promoveze sau să umble la gradele altora).
router.put('/:email', requireAuth, requireRank(canManageRanks), (req, res) => {
  const targetEmail = String(req.params.email).toLowerCase();
  const newRank = String(req.body.rank || '');
  if (!RANKS[newRank]) return res.status(400).json({ error: 'grad invalid.' });

  const target = getAccount.get(targetEmail);
  if (!target) return res.status(404).json({ error: 'cont inexistent.' });

  setRank.run(newRank, targetEmail);
  res.json({ ok: true, email: targetEmail, rank: newRank });
});

module.exports = router;
