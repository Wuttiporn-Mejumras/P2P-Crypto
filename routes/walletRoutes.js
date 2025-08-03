const router = require('express').Router();
const ctrl = require('../controllers/walletController');

router.post('/create', ctrl.create);
router.get('/:address/balance', ctrl.getBalance);
router.post('/topup', ctrl.topup);

module.exports = router;