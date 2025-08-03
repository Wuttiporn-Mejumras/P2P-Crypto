const router = require('express').Router();

router.use('/wallet', require('./walletRoutes'));
router.use('/orders', require('./orderRoutes'));
router.use('/chain', require('./chainRoutes'));
router.use('/topup', require('./topupRoutes'));
router.use('/auth',   require('./authRoutes')); 
module.exports = router;