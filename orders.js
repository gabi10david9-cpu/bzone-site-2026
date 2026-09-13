const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireRank } = require('../middleware/auth');
const { ORDER_CATALOG, canViewPending, canDecideOrders, canEditStock } = require('../catalog');

const router = express.Router();

const getAllStock = db.prepare('SELECT item_id, qty FROM stock');
const getStockRow = db.prepare('SELECT qty FROM stock WHERE item_id = ?');
const setStockRow = db.prepare('UPDATE stock SET qty = ? WHERE item_id = ?');

const insertOrder = db.prepare(
  `INSERT INTO orders (id, user_email, item_id, item_name, price, qty, status, ts)
   VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
);
const myOrders = db.prepare('SELECT * FROM orders WHERE user_email = ? ORDER BY ts DESC');
const pendingOrders = db.prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY ts ASC");
const getOrder = db.prepare('SELECT * FROM orders WHERE id = ?');
const decideOrderStmt = db.prepare('UPDATE orders SET status = ?, decided_by = ? WHERE id = ?');

function stockAsMap() {
  const map = {};
  getAllStock.all().forEach((r) => { map[r.item_id] = r.qty; });
  ORDER_CATALOG.forEach((item) => { if (typeof map[item.id] !== 'number') map[item.id] = 0; });
  return map;
}

router.get('/catalog', requireAuth, (req, res) => {
  res.json({ catalog: ORDER_CATALOG });
});

router.get('/stock', requireAuth, (req, res) => {
  res.json({ stock: stockAsMap() });
});

router.put('/stock/:itemId', requireAuth, requireRank(canEditStock), (req, res) => {
  const { itemId } = req.params;
  if (!ORDER_CATALOG.find((i) => i.id === itemId)) {
    return res.status(404).json({ error: 'produs necunoscut.' });
  }
  let qty = parseInt(req.body.qty, 10);
  if (isNaN(qty) || qty < 0) qty = 0;

  const existing = getStockRow.get(itemId);
  if (existing) setStockRow.run(qty, itemId);
  else db.prepare('INSERT INTO stock (item_id, qty) VALUES (?, ?)').run(itemId, qty);

  res.json({ ok: true, stock: stockAsMap() });
});

router.get('/mine', requireAuth, (req, res) => {
  res.json({ orders: myOrders.all(req.user.email) });
});

router.get('/pending', requireAuth, requireRank(canViewPending), (req, res) => {
  res.json({ orders: pendingOrders.all() });
});

router.post('/', requireAuth, (req, res) => {
  const item = ORDER_CATALOG.find((i) => i.id === req.body.itemId);
  if (!item) return res.status(400).json({ error: 'produs necunoscut.' });

  let qty = parseInt(req.body.qty, 10);
  if (isNaN(qty) || qty < 1) qty = 1;

  const stock = stockAsMap();
  if (qty > (stock[item.id] || 0)) {
    return res.status(400).json({ error: `stoc insuficient — disponibil: ${stock[item.id] || 0}.` });
  }

  const id = uuidv4();
  const ts = Date.now();
  insertOrder.run(id, req.user.email, item.id, item.name, item.price, qty, ts);
  res.status(201).json({ order: getOrder.get(id) });
});

router.post('/:id/decide', requireAuth, requireRank(canDecideOrders), (req, res) => {
  const order = getOrder.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'comandă inexistentă.' });
  if (order.status !== 'pending') return res.status(409).json({ error: 'comanda a fost deja procesată.' });

  const decision = req.body.decision === 'aprobat' ? 'aprobat' : 'respins';

  if (decision === 'aprobat') {
    const row = getStockRow.get(order.item_id);
    const have = row ? row.qty : 0;
    if (have < order.qty) {
      return res.status(400).json({ error: `stoc insuficient (${have} disponibil).` });
    }
    setStockRow.run(have - order.qty, order.item_id);
  }

  decideOrderStmt.run(decision, req.user.email, order.id);
  res.json({ ok: true, order: getOrder.get(order.id), stock: stockAsMap() });
});

module.exports = router;
