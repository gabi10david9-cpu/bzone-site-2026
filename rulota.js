const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireRank } = require('../middleware/auth');
const { canViewPending, canDecideOrders, canEditStock } = require('../catalog');

const router = express.Router();

const getStock = db.prepare('SELECT qty FROM rulota_stock WHERE id = 1');
const setStock = db.prepare('UPDATE rulota_stock SET qty = ? WHERE id = 1');

const myRequests = db.prepare('SELECT * FROM rulota_requests WHERE user_email = ? ORDER BY ts DESC');
const pendingRequests = db.prepare("SELECT * FROM rulota_requests WHERE status = 'pending' ORDER BY ts ASC");
const getRequest = db.prepare('SELECT * FROM rulota_requests WHERE id = ?');
const insertRequest = db.prepare(
  `INSERT INTO rulota_requests (id, user_email, qty, note, status, ts) VALUES (?, ?, ?, ?, 'pending', ?)`
);
const decideRequestStmt = db.prepare('UPDATE rulota_requests SET status = ?, decided_by = ? WHERE id = ?');

router.get('/stock', requireAuth, (req, res) => {
  res.json({ qty: getStock.get().qty });
});

router.put('/stock', requireAuth, requireRank(canEditStock), (req, res) => {
  let qty = parseInt(req.body.qty, 10);
  if (isNaN(qty) || qty < 0) qty = 0;
  setStock.run(qty);
  res.json({ ok: true, qty });
});

router.get('/mine', requireAuth, (req, res) => {
  res.json({ requests: myRequests.all(req.user.email) });
});

router.get('/pending', requireAuth, requireRank(canViewPending), (req, res) => {
  res.json({ requests: pendingRequests.all() });
});

router.post('/', requireAuth, (req, res) => {
  let qty = parseInt(req.body.qty, 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  const note = String(req.body.note || '').trim().slice(0, 120);

  const id = uuidv4();
  insertRequest.run(id, req.user.email, qty, note, Date.now());
  res.status(201).json({ request: getRequest.get(id) });
});

router.post('/:id/decide', requireAuth, requireRank(canDecideOrders), (req, res) => {
  const target = getRequest.get(req.params.id);
  if (!target) return res.status(404).json({ error: 'cerere inexistentă.' });
  if (target.status !== 'pending') return res.status(409).json({ error: 'cererea a fost deja procesată.' });

  const decision = req.body.decision === 'aprobat' ? 'aprobat' : 'respins';

  if (decision === 'aprobat') {
    const stock = getStock.get().qty;
    if (stock < target.qty) {
      return res.status(400).json({ error: `stoc insuficient (${stock} disponibil).` });
    }
    setStock.run(stock - target.qty);
  }

  decideRequestStmt.run(decision, req.user.email, target.id);
  res.json({ ok: true, request: getRequest.get(target.id), stockQty: getStock.get().qty });
});

module.exports = router;
