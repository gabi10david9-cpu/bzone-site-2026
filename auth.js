const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

const getAccountStmt = db.prepare('SELECT email, rank, blocked FROM accounts WHERE email = ?');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'lipsă token de autentificare.' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'sesiune invalidă sau expirată — te rugăm să te autentifici din nou.' });
  }

  // Always re-read the rank fresh from the DB, so a promotion/demotion
  // takes effect immediately even if the person is still holding an old token.
  const account = getAccountStmt.get(payload.email);
  if (!account) return res.status(401).json({ error: 'cont inexistent.' });
  if (account.blocked) return res.status(403).json({ error: 'contul tău a fost blocat de conducere.' });

  req.user = { email: account.email, rank: account.rank };
  next();
}

function requireRank(checkFn) {
  return (req, res, next) => {
    if (!req.user || !checkFn(req.user.rank)) {
      return res.status(403).json({ error: 'nu ai permisiunile necesare pentru această acțiune.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRank };
