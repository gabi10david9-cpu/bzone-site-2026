const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { ORDER_CATALOG } = require('./catalog');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bzone.db');

// Ensure the folder that will hold the .db file exists.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    email TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    rank TEXT NOT NULL DEFAULT 'membru',
    created_at INTEGER NOT NULL,
    blocked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    body TEXT NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock (
    item_id TEXT PRIMARY KEY,
    qty INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT,
    ts INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    time_label TEXT,
    description TEXT,
    created_by TEXT NOT NULL,
    ts INTEGER NOT NULL,
    participants TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS rulota_stock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    qty INTEGER NOT NULL DEFAULT 10
  );

  CREATE TABLE IF NOT EXISTS rulota_requests (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    qty INTEGER NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT,
    ts INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS strikes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    reason TEXT NOT NULL,
    issued_by TEXT NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_strikes_user ON strikes(user_email);

  CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_email);
  CREATE INDEX IF NOT EXISTS idx_rulota_status ON rulota_requests(status);
  CREATE INDEX IF NOT EXISTS idx_rulota_user ON rulota_requests(user_email);
`);

// Migrare: dacă baza de date exista deja înainte de a introduce blocarea de
// conturi, adaugă coloana lipsă fără să distrugă datele existente.
const accountCols = db.prepare("PRAGMA table_info(accounts)").all().map((c) => c.name);
if (!accountCols.includes('blocked')) {
  db.exec("ALTER TABLE accounts ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0");
}

// Seed stock rows for any catalog item that doesn't have one yet.
const insertStock = db.prepare(
  'INSERT OR IGNORE INTO stock (item_id, qty) VALUES (?, ?)'
);
const seedStock = db.transaction((items) => {
  items.forEach((item) => insertStock.run(item.id, 10));
});
seedStock(ORDER_CATALOG);

// Seed the single rulota_stock row.
db.prepare('INSERT OR IGNORE INTO rulota_stock (id, qty) VALUES (1, 10)').run();

module.exports = db;
