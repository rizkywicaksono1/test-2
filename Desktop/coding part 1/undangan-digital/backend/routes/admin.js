// routes/admin.js — panel admin: kelola template, lihat pesanan & RSVP
const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// ---------- TEMPLATE ----------

// GET /api/admin/templates — termasuk yang non-aktif
router.get('/templates', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM templates ORDER BY created_at DESC');
  res.json(rows);
});

// POST /api/admin/templates — tambah template baru
router.post('/templates', async (req, res) => {
  try {
    const { name, category, description, price, thumbnail_url, demo_slug } = req.body;
    if (!name || !category || price == null) {
      return res.status(400).json({ error: 'Nama, kategori, dan harga wajib diisi.' });
    }
    const [result] = await pool.query(
      `INSERT INTO templates (name, category, description, price, thumbnail_url, demo_slug)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, category, description || null, price, thumbnail_url || null, demo_slug || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah template.' });
  }
});

// PUT /api/admin/templates/:id — ubah template (termasuk harga & status aktif)
router.put('/templates/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template tidak ditemukan.' });
    const t = rows[0];
    const { name, category, description, price, thumbnail_url, demo_slug, is_active } = req.body;

    await pool.query(
      `UPDATE templates SET name=?, category=?, description=?, price=?, thumbnail_url=?, demo_slug=?, is_active=?
       WHERE id = ?`,
      [
        name ?? t.name,
        category ?? t.category,
        description ?? t.description,
        price ?? t.price,
        thumbnail_url ?? t.thumbnail_url,
        demo_slug ?? t.demo_slug,
        typeof is_active === 'boolean' ? is_active : t.is_active,
        t.id,
      ]
    );
    res.json({ message: 'Template berhasil diperbarui.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui template.' });
  }
});

// DELETE /api/admin/templates/:id
router.delete('/templates/:id', async (req, res) => {
  try {
    const [used] = await pool.query('SELECT id FROM orders WHERE template_id = ? LIMIT 1', [req.params.id]);
    if (used.length > 0) {
      // Sudah pernah dipakai di pesanan -> nonaktifkan saja, jangan dihapus, agar data pesanan lama tetap utuh
      await pool.query('UPDATE templates SET is_active = 0 WHERE id = ?', [req.params.id]);
      return res.json({ message: 'Template sudah pernah dipesan, jadi dinonaktifkan (bukan dihapus) agar data pesanan lama tetap aman.' });
    }
    await pool.query('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Template berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus template.' });
  }
});

// ---------- PESANAN ----------

// GET /api/admin/orders — semua pesanan + status bayar
router.get('/orders', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.order_code, o.amount, o.status, o.payment_type, o.paid_at, o.created_at,
              u.name AS customer_name, u.email AS customer_email,
              t.name AS template_name,
              i.slug AS invitation_slug
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN templates t ON t.id = o.template_id
       LEFT JOIN invitations i ON i.order_id = o.id
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat pesanan.' });
  }
});

// ---------- RSVP ----------

// GET /api/admin/rsvps — semua RSVP dari seluruh undangan
router.get('/rsvps', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.guest_name, r.attendance, r.guest_count, r.message, r.created_at,
              i.slug AS invitation_slug, i.main_title
       FROM rsvps r
       JOIN invitations i ON i.id = r.invitation_id
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data RSVP.' });
  }
});

// GET /api/admin/rsvps/:invitationId — RSVP untuk satu undangan tertentu
router.get('/rsvps/:invitationId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, guest_name, attendance, guest_count, message, created_at
       FROM rsvps WHERE invitation_id = ? ORDER BY created_at DESC`,
      [req.params.invitationId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat RSVP.' });
  }
});

module.exports = router;
