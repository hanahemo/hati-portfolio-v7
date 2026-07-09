const express = require('express');
const source = require('../data/source');

const router = express.Router();

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
