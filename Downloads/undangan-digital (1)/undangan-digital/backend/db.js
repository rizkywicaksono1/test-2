// db.js — koneksi pool ke MySQL / TiDB
const mysql = require('mysql2/promise');
require('dotenv').config();

const sslOption =
  String(process.env.DB_SSL).toLowerCase() === 'true'
    ? { rejectUnauthorized: true }
    : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: sslOption,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

module.exports = pool;
