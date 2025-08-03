const router = require('express').Router();
const ctrl = require('../controllers/topupController');

router.get('/list', ctrl.list);        

module.exports = router;