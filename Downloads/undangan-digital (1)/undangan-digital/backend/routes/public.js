// routes/public.js — halaman undangan publik & RSVP (tanpa login)
const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/public/invitation/:slug — data undangan untuk ditampilkan ke tamu
router.get('/invitation/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*, t.name AS template_name, t.category AS template_category
       FROM invitations i
       JOIN templates t ON t.id = i.template_id
       WHERE i.slug = ? AND i.is_published = 1`,
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });

    const inv = rows[0];
    inv.gallery_photos = safeParse(inv.gallery_photos, []);
    inv.extra_data = safeParse(inv.extra_data, {});

    const [rsvpSummary] = await pool.query(
      `SELECT
         SUM(CASE WHEN attendance = 'hadir' THEN guest_count ELSE 0 END) AS total_hadir,
         SUM(CASE WHEN attendance = 'tidak_hadir' THEN 1 ELSE 0 END) AS total_tidak_hadir,
         COUNT(*) AS total_ucapan
       FROM rsvps WHERE invitation_id = ?`,
      [inv.id]
    );

    const [wishes] = await pool.query(
      `SELECT guest_name, attendance, guest_count, message, created_at
       FROM rsvps WHERE invitation_id = ? ORDER BY created_at DESC LIMIT 100`,
      [inv.id]
    );

    res.json({ invitation: inv, summary: rsvpSummary[0], wishes });
  } catch (err) {
    console.error('Get public invitation error:', err);
    res.status(500).json({ error: 'Gagal memuat undangan.' });
  }
});

// POST /api/public/invitation/:slug/rsvp — tamu mengisi konfirmasi kehadiran
router.post('/invitation/:slug/rsvp', async (req, res) => {
  try {
    const { guest_name, attendance, guest_count, message } = req.body;
    if (!guest_name || !attendance) {
      return res.status(400).json({ error: 'Nama dan status kehadiran wajib diisi.' });
    }
    if (!['hadir', 'tidak_hadir', 'ragu'].includes(attendance)) {
      return res.status(400).json({ error: 'Status kehadiran tidak valid.' });
    }

    const [rows] = await pool.query(
      'SELECT id FROM invitations WHERE slug = ? AND is_published = 1',
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });

    await pool.query(
      `INSERT INTO rsvps (invitation_id, guest_name, attendance, guest_count, message)
       VALUES (?, ?, ?, ?, ?)`,
      [rows[0].id, guest_name.trim(), attendance, Number(guest_count) || 1, message || null]
    );

    res.status(201).json({ message: 'Terima kasih, konfirmasi kehadiran Anda telah diterima.' });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ error: 'Gagal mengirim RSVP.' });
  }
});

function safeParse(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = router;
