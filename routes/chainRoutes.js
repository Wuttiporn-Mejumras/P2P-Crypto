// routes/chainRoutes.js
const router = require('express').Router();
const ctrl = require('../controllers/chainController');

router.get('/head',   ctrl.head);
router.get('/blocks', ctrl.blocks);
router.post('/ingest', ctrl.ingest);
router.get('/verify', ctrl.verify);

module.exports = router;
