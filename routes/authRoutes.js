const router = require('express').Router();
const auth = require('../controllers/authController');
router.get('/nonce',  auth.getNonce);     // GET  /api/auth/nonce?address=...
router.post('/login', auth.login);        // POST /api/auth/login
router.post('/logout', auth.logout);      // (optional)
module.exports = router;