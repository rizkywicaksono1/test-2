// middleware/auth.js — verifikasi JWT & pengecekan admin
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, is_admin }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi tidak valid atau kedaluwarsa, silakan masuk kembali.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Akses khusus admin.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
