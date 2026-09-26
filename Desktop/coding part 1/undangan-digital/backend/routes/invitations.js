// routes/invitations.js — editor undangan (hanya untuk pesanan yang sudah lunas)
const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// GET /api/invitations/check-slug/:slug — cek ketersediaan slug
router.get('/check-slug/:slug', requireAuth, async (req, res) => {
  try {
    const slug = slugify(req.params.slug);
    const [rows] = await pool.query('SELECT id FROM invitations WHERE slug = ?', [slug]);
    res.json({ slug, available: rows.length === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memeriksa slug.' });
  }
});

// GET /api/invitations/my — daftar undangan milik user (yang sudah dibuat)
router.get('/my', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.id, i.slug, i.main_title, i.event_type, i.event_date, i.is_published, i.updated_at,
              t.name AS template_name
       FROM invitations i
       JOIN templates t ON t.id = i.template_id
       WHERE i.user_id = ?
       ORDER BY i.updated_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat daftar undangan.' });
  }
});

// GET /api/invitations/by-order/:orderId — ambil (atau info bahwa belum ada) undangan untuk sebuah order
router.get('/by-order/:orderId', requireAuth, async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);
    if (orders.length === 0) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    const order = orders[0];
    if (order.user_id !== req.user.id) return res.status(403).json({ error: 'Bukan pesanan Anda.' });
    if (order.status !== 'paid') {
      return res.status(402).json({ error: 'Pesanan belum lunas. Editor terbuka otomatis setelah pembayaran dikonfirmasi.' });
    }

    const [invitations] = await pool.query('SELECT * FROM invitations WHERE order_id = ?', [order.id]);
    res.json({ order, invitation: invitations[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data editor.' });
  }
});

// POST /api/invitations — membuat undangan baru untuk sebuah order yang sudah lunas
router.post('/', requireAuth, async (req, res) => {
  try {
    const { order_id, slug, event_type, main_title, person_a_name, person_b_name,
            event_date, location_name, location_address, location_map_url,
            cover_photo_url, gallery_photos, music_url, extra_data } = req.body;

    if (!order_id || !slug) {
      return res.status(400).json({ error: 'order_id dan slug wajib diisi.' });
    }

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orders.length === 0) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    const order = orders[0];

    if (order.user_id !== req.user.id) return res.status(403).json({ error: 'Bukan pesanan Anda.' });
    if (order.status !== 'paid') {
      return res.status(402).json({ error: 'Pesanan belum berstatus lunas.' });
    }

    const [existing] = await pool.query('SELECT id FROM invitations WHERE order_id = ?', [order.id]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Undangan untuk pesanan ini sudah pernah dibuat.', invitation_id: existing[0].id });
    }

    const cleanSlug = slugify(slug);
    const [slugTaken] = await pool.query('SELECT id FROM invitations WHERE slug = ?', [cleanSlug]);
    if (slugTaken.length > 0) {
      return res.status(409).json({ error: 'Link/slug tersebut sudah dipakai, coba nama lain.' });
    }

    const [result] = await pool.query(
      `INSERT INTO invitations
        (order_id, user_id, template_id, slug, event_type, main_title, person_a_name, person_b_name,
         event_date, location_name, location_address, location_map_url, cover_photo_url,
         gallery_photos, music_url, extra_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id, req.user.id, order.template_id, cleanSlug,
        event_type || null, main_title || null, person_a_name || null, person_b_name || null,
        event_date || null, location_name || null, location_address || null, location_map_url || null,
        cover_photo_url || null,
        JSON.stringify(gallery_photos || []),
        music_url || null,
        JSON.stringify(extra_data || {}),
      ]
    );

    res.status(201).json({ id: result.insertId, slug: cleanSlug });
  } catch (err) {
    console.error('Create invitation error:', err);
    res.status(500).json({ error: 'Gagal menyimpan undangan.' });
  }
});

// GET /api/invitations/:id — ambil satu undangan milik sendiri (untuk dibuka di editor)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invitations WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
    const inv = rows[0];
    if (inv.user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Anda tidak berhak mengakses undangan ini.' });
    }
    res.json(inv);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat undangan.' });
  }
});

// PUT /api/invitations/:id — ubah isi undangan lewat editor
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invitations WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
    const inv = rows[0];
    if (inv.user_id !== req.user.id) return res.status(403).json({ error: 'Anda tidak berhak mengubah undangan ini.' });

    const {
      event_type, main_title, person_a_name, person_b_name, event_date,
      location_name, location_address, location_map_url, cover_photo_url,
      gallery_photos, music_url, extra_data, is_published, slug,
    } = req.body;

    let newSlug = inv.slug;
    if (slug && slugify(slug) !== inv.slug) {
      const cleanSlug = slugify(slug);
      const [slugTaken] = await pool.query('SELECT id FROM invitations WHERE slug = ? AND id <> ?', [cleanSlug, inv.id]);
      if (slugTaken.length > 0) {
        return res.status(409).json({ error: 'Link/slug tersebut sudah dipakai, coba nama lain.' });
      }
      newSlug = cleanSlug;
    }

    await pool.query(
      `UPDATE invitations SET
        slug = ?, event_type = ?, main_title = ?, person_a_name = ?, person_b_name = ?, event_date = ?,
        location_name = ?, location_address = ?, location_map_url = ?, cover_photo_url = ?,
        gallery_photos = ?, music_url = ?, extra_data = ?, is_published = ?
       WHERE id = ?`,
      [
        newSlug,
        event_type ?? inv.event_type,
        main_title ?? inv.main_title,
        person_a_name ?? inv.person_a_name,
        person_b_name ?? inv.person_b_name,
        event_date ?? inv.event_date,
        location_name ?? inv.location_name,
        location_address ?? inv.location_address,
        location_map_url ?? inv.location_map_url,
        cover_photo_url ?? inv.cover_photo_url,
        JSON.stringify(gallery_photos ?? JSON.parse(inv.gallery_photos || '[]')),
        music_url ?? inv.music_url,
        JSON.stringify(extra_data ?? JSON.parse(inv.extra_data || '{}')),
        typeof is_published === 'boolean' ? is_published : inv.is_published,
        inv.id,
      ]
    );

    res.json({ id: inv.id, slug: newSlug, message: 'Undangan berhasil disimpan.' });
  } catch (err) {
    console.error('Update invitation error:', err);
    res.status(500).json({ error: 'Gagal menyimpan perubahan.' });
  }
});

module.exports = router;
