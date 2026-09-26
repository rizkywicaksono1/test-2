// utils/midtrans.js — client Midtrans Snap
const midtransClient = require('midtrans-client');
require('dotenv').config();

const snap = new midtransClient.Snap({
  isProduction: String(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

const coreApi = new midtransClient.CoreApi({
  isProduction: String(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

module.exports = { snap, coreApi };
