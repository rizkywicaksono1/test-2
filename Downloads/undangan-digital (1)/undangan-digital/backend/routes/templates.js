// routes/templates.js — katalog template (publik)
const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/templates?category=pernikahan
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT id, name, category, description, price, thumbnail_url, demo_slug FROM templates WHERE is_active = 1';
    const params = [];
    if (category && category !== 'semua') {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Gagal memuat katalog template.' });
  }
});

// GET /api/templates/categories -> daftar kategori unik untuk filter
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT category FROM templates WHERE is_active = 1 ORDER BY category'
    );
    res.json(rows.map((r) => r.category));
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat kategori.' });
  }
});

// GET /api/templates/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, category, description, price, thumbnail_url, demo_slug FROM templates WHERE id = ? AND is_active = 1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Template tidak ditemukan.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat detail template.' });
  }
});

module.exports = router;
