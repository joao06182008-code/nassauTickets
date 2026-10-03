const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Rota de saúde para testar se a API e a BD respondem
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS solution');
    res.json({ status: 'ok', database: 'conectada', test: rows[0].solution });
  } catch (error) {
    res.status(500).json({ status: 'erro', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor nassauTickets a correr na porta ${PORT}`);
});