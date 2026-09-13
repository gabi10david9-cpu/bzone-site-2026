const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireRank } = require('../middleware/auth');
const { canManageOps } = require('../catalog'); // strict lider

const router = express.Router();

const listActions = db.prepare('SELECT * FROM actions ORDER BY ts DESC');
const getAction = db.prepare('SELECT * FROM actions WHERE id = ?');
const insertAction = db.prepare(
  `INSERT INTO actions (id, title, time_label, description, created_by, ts, participants)
   VALUES (?, ?, ?, ?, ?, ?, '[]')`
);
const setParticipants = db.prepare('UPDATE actions SET participants = ? WHERE id = ?');
const deleteAction = db.prepare('DELETE FROM actions WHERE id = ?');

function toJSON(row) {
  return { ...row, participants: JSON.parse(row.participants || '[]') };
}

router.get('/', requireAuth, (req, res) => {
  res.json({ actions: listActions.all().map(toJSON) });
});

router.post('/', requireAuth, requireRank(canManageOps), (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 80);
  const time = String(req.body.time || '').trim().slice(0, 40);
  const desc = String(req.body.desc || '').trim().slice(0, 400);
  if (!title) return res.status(400).json({ error: 'titlul e obligatoriu.' });

  const id = uuidv4();
  insertAction.run(id, title, time, desc, req.user.email, Date.now());
  const action = toJSON(getAction.get(id));
  req.app.get('io').emit('actions:new', action);
  res.status(201).json({ action });
});

router.post('/:id/join', requireAuth, (req, res) => {
  const row = getAction.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'acțiune inexistentă.' });

  const participants = JSON.parse(row.participants || '[]');
  const idx = participants.indexOf(req.user.email);
  if (idx === -1) participants.push(req.user.email);
  else participants.splice(idx, 1);

  setParticipants.run(JSON.stringify(participants), row.id);
  const action = toJSON(getAction.get(row.id));
  req.app.get('io').emit('actions:update', action);
  res.json({ action });
});

router.delete('/:id', requireAuth, requireRank(canManageOps), (req, res) => {
  const row = getAction.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'acțiune inexistentă.' });
  deleteAction.run(row.id);
  req.app.get('io').emit('actions:delete', { id: row.id });
  res.json({ ok: true });
});

module.exports = router;
