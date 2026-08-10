const express = require('express');
const source = require('../data/source');

const router = express.Router();

// 어드민에서 수시로 바뀌는 콘텐츠 — 브라우저가 옛 응답을 재사용하면(캐시) 추가한 게 안 보인다.
// Cache-Control 없이 etag만 있으면 휴리스틱 캐싱으로 stale 응답을 물 수 있어, 항상 새로 받게 no-store.
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

router.get('/portfolio', async (req, res) => {
  try {
    const data = await source.readPortfolio();
    if (!data) return res.status(500).json({ error: 'portfolio data missing' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'read failed' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const data = await source.readSettings();
    if (!data) return res.status(500).json({ error: 'settings data missing' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'read failed' });
  }
});

module.exports = router;
