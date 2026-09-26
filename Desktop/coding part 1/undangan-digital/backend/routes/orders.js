// routes/orders.js — pemesanan template & integrasi pembayaran Midtrans
const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { snap } = require('../utils/midtrans');

const router = express.Router();

function generateOrderCode() {
  const rand = crypto.randomBytes(4).toString('hex');
  return `INV-${Date.now()}-${rand}`;
}

// POST /api/orders — buat pesanan baru + ambil Snap token dari Midtrans
router.post('/', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { template_id } = req.body;
    if (!template_id) return res.status(400).json({ error: 'template_id wajib diisi.' });

    const [templates] = await conn.query(
      'SELECT * FROM templates WHERE id = ? AND is_active = 1',
      [template_id]
    );
    if (templates.length === 0) {
      return res.status(404).json({ error: 'Template tidak ditemukan atau sudah tidak dijual.' });
    }
    const template = templates[0];

    const [users] = await conn.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = users[0];

    const orderCode = generateOrderCode();
    const amount = Number(template.price);

    const [result] = await conn.query(
      `INSERT INTO orders (order_code, user_id, template_id, amount, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [orderCode, user.id, template.id, amount]
    );

    // Buat transaksi Midtrans Snap
    const parameter = {
      transaction_details: {
        order_id: orderCode,
        gross_amount: Math.round(amount),
      },
      customer_details: {
        first_name: user.name,
        email: user.email,
      },
      item_details: [
        {
          id: `template-${template.id}`,
          price: Math.round(amount),
          quantity: 1,
          name: `Undangan Digital - ${template.name}`.slice(0, 50),
        },
      ],
      enabled_payments: [
        'qris', 'gopay', 'shopeepay', 'other_qris',
        'bank_transfer', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'other_va',
      ],
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/pesanan/${result.insertId}`,
      },
    };

    const transaction = await snap.createTransaction(parameter);

    await conn.query('UPDATE orders SET snap_token = ? WHERE id = ?', [transaction.token, result.insertId]);

    res.status(201).json({
      order_id: result.insertId,
      order_code: orderCode,
      snap_token: transaction.token,
      redirect_url: transaction.redirect_url,
      client_key: process.env.MIDTRANS_CLIENT_KEY,
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Gagal membuat pesanan. Coba lagi nanti.' });
  } finally {
    conn.release();
  }
});

// POST /api/orders/notification — webhook dari Midtrans (TIDAK pakai auth JWT)
router.post('/notification', async (req, res) => {
  try {
    const notification = req.body;
    const orderCode = notification.order_id;
    const statusCode = notification.status_code;
    const grossAmount = notification.gross_amount;
    const signatureKey = notification.signature_key;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    // Verifikasi signature agar notifikasi benar-benar dari Midtrans
    const expectedSignature = crypto
      .createHash('sha512')
      .update(orderCode + statusCode + grossAmount + process.env.MIDTRANS_SERVER_KEY)
      .digest('hex');

    if (expectedSignature !== signatureKey) {
      console.warn('Signature Midtrans tidak cocok untuk order:', orderCode);
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const [orders] = await pool.query('SELECT * FROM orders WHERE order_code = ?', [orderCode]);
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order tidak ditemukan' });
    }
    const order = orders[0];

    let newStatus = order.status;
    let paidAt = order.paid_at;

    if (transactionStatus === 'capture') {
      newStatus = fraudStatus === 'accept' ? 'paid' : 'pending';
      if (newStatus === 'paid') paidAt = new Date();
    } else if (transactionStatus === 'settlement') {
      newStatus = 'paid';
      paidAt = new Date();
    } else if (transactionStatus === 'pending') {
      newStatus = 'pending';
    } else if (transactionStatus === 'deny' || transactionStatus === 'failure') {
      newStatus = 'failed';
    } else if (transactionStatus === 'expire') {
      newStatus = 'expired';
    } else if (transactionStatus === 'cancel') {
      newStatus = 'cancelled';
    }

    await pool.query(
      `UPDATE orders
       SET status = ?, payment_type = ?, midtrans_transaction_id = ?, raw_notification = ?, paid_at = ?
       WHERE id = ?`,
      [
        newStatus,
        notification.payment_type || null,
        notification.transaction_id || null,
        JSON.stringify(notification),
        paidAt,
        order.id,
      ]
    );

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Midtrans notification error:', err);
    res.status(500).json({ error: 'Gagal memproses notifikasi.' });
  }
});

// GET /api/orders/my — daftar pesanan milik user yang sedang login
router.get('/my', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.order_code, o.amount, o.status, o.payment_type, o.paid_at, o.created_at,
              t.name AS template_name, t.thumbnail_url,
              i.slug AS invitation_slug
       FROM orders o
       JOIN templates t ON t.id = o.template_id
       LEFT JOIN invitations i ON i.order_id = o.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List my orders error:', err);
    res.status(500).json({ error: 'Gagal memuat pesanan.' });
  }
});

// GET /api/orders/:id — detail satu pesanan (untuk polling status setelah bayar)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, t.name AS template_name, i.slug AS invitation_slug
       FROM orders o
       JOIN templates t ON t.id = o.template_id
       LEFT JOIN invitations i ON i.order_id = o.id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    const order = rows[0];
    if (order.user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Anda tidak berhak melihat pesanan ini.' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat detail pesanan.' });
  }
});

module.exports = router;
