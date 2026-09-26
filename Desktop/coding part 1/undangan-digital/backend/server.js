// server.js — entry point backend Toko Undangan Digital
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const templateRoutes = require('./routes/templates');
const orderRoutes = require('./routes/orders');
const invitationRoutes = require('./routes/invitations');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

// CORS: izinkan frontend di Vercel mengakses API ini
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173'].filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Ditolak oleh kebijakan CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '5mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'API Toko Undangan Digital berjalan.' });
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

// Error handler umum
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API Toko Undangan Digital berjalan di port ${PORT}`);
});
