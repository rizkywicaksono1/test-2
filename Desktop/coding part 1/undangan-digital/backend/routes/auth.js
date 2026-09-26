// routes/auth.js — registrasi, login, login Google, profil pengguna
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, is_admin: !!user.is_admin, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nama, email, dan password wajib diisi.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hash]
    );

    const user = { id: result.insertId, name, email, is_admin: 0 };
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: false } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Gagal mendaftar. Coba lagi nanti.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Gagal masuk. Coba lagi nanti.' });
  }
});

// POST /api/auth/google — daftar / masuk otomatis pakai akun Google
// Menerima "credential" = ID token dari tombol Google Sign-In di frontend.
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Token Google tidak ditemukan.' });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Login Google belum dikonfigurasi di server (GOOGLE_CLIENT_ID kosong).' });
    }

    // Verifikasi token langsung ke server Google, tanpa perlu library tambahan.
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Token Google tidak valid atau kedaluwarsa.' });
    }
    const payload = await verifyRes.json();

    // Pastikan token ini memang dibuat untuk aplikasi kita (mencegah token dari aplikasi lain dipakai di sini)
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Token Google tidak sesuai dengan aplikasi ini.' });
    }
    if (payload.email_verified !== 'true' && payload.email_verified !== true) {
      return res.status(401).json({ error: 'Email Google Anda belum terverifikasi.' });
    }

    const email = String(payload.email).toLowerCase().trim();
    const name = payload.name || email.split('@')[0];

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    let user;

    if (rows.length === 0) {
      // Akun baru dari Google: buat password acak (tidak pernah dipakai, login tetap lewat Google)
      const randomPassword = crypto.randomBytes(24).toString('hex');
      const hash = await bcrypt.hash(randomPassword, 10);
      const [result] = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name, email, hash]
      );
      user = { id: result.insertId, name, email, is_admin: 0 };
    } else {
      user = rows[0];
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Gagal masuk dengan Google. Coba lagi nanti.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, is_admin FROM users WHERE id = ?', [req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
  const u = rows[0];
  res.json({ id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin });
});

module.exports = router;
