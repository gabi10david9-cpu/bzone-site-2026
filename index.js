require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('EROARE: variabila de mediu JWT_SECRET nu e setată. Copiază .env.example în .env și completeaz-o.');
  process.exit(1);
}

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const ranksRoutes = require('./routes/ranks');
const ordersRoutes = require('./routes/orders');
const actionsRoutes = require('./routes/actions');
const rulotaRoutes = require('./routes/rulota');
const accountsRoutes = require('./routes/accounts');
const strikesRoutes = require('./routes/strikes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' }
});
app.set('io', io);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '100kb' }));

// Rate-limit the auth endpoints specifically, to slow down brute-force attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'prea multe încercări — mai încearcă peste câteva minute.' }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ranks', ranksRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/actions', actionsRoutes);
app.use('/api/rulota', rulotaRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/strikes', strikesRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback: any non-API route serves the app shell.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

io.on('connection', () => {
  // No auth needed on the socket itself — it's used only to broadcast
  // events that were already validated over the authenticated REST API.
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`B_ZONE rulează pe http://localhost:${PORT}`);
});
