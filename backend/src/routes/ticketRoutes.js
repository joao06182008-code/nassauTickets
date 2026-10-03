const express = require('express');
const router = express.Router();
const { emitirSenha } = require('../controllers/ticketController');

// Rota pública para o Totem emitir uma senha
router.post('/tickets', emitirSenha);

module.exports = router;