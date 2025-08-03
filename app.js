// app.js
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// เสิร์ฟไฟล์ static จากโฟลเดอร์ public/
app.use(express.static(path.join(__dirname, 'public')));

// หน้าแรก -> ไปหน้า login (client-auth.html)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// (ถ้าอยากเก็บ health check แยกไว้ก็ได้ เช่น /healthz)
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'p2p-crypto-mini-chain' }));

// Mount API routes
app.use('/api', require('./routes/index.js')); // <— ชื่อต้องเป็น .js

// 404 (ต้องมา "หลังสุด" ของทุก route)
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// error handler
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
