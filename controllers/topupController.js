const TopUp = require('../models/TopUp');

exports.list = async (req, res) => {
  try {
    const { address } = req.query;
    const q = TopUp.query().orderBy('createdAt', 'desc');
    if (address) q.where('address', address);
    const rows = await q;
    res.json(rows);
  } catch (e) {
    console.error('TopUp list error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
