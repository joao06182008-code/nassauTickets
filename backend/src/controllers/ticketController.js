const pool = require('../config/db');

const emitirSenha = async (req, res) => {
  const { tipo_codigo } = req.body;

  if (!tipo_codigo) {
    return res.status(400).json({ erro: 'O código do tipo de senha é obrigatório.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Validar se o tipo de senha existe
    const [tipos] = await connection.query(
      'SELECT * FROM tipos_senha WHERE codigo = ?',
      [tipo_codigo]
    );

    if (tipos.length === 0) {
      await connection.release();
      return res.status(404).json({ erro: 'Tipo de senha inválido.' });
    }

    const hoje = new Date().toISOString().slice(0, 10);

    // 2. Controlar a sequência diária 
    const [colunas] = await connection.query('SHOW COLUMNS FROM sequenciais_diarios');
    const colunaSeq = colunas.find(c => c.Field !== 'data_referencia' && c.Field !== 'tipo_codigo');
    
    if (!colunaSeq) throw new Error('Coluna de sequência não encontrada em sequenciais_diarios.');
    const nomeColunaNum = colunaSeq.Field;

    let [seqs] = await connection.query(
      `SELECT ${nomeColunaNum} FROM sequenciais_diarios WHERE data_referencia = ? AND tipo_codigo = ? FOR UPDATE`,
      [hoje, tipo_codigo]
    );

    let proximoNumero = 1;
    if (seqs.length > 0) {
      proximoNumero = seqs[0][nomeColunaNum] + 1;
      await connection.query(
        `UPDATE sequenciais_diarios SET ${nomeColunaNum} = ? WHERE data_referencia = ? AND tipo_codigo = ?`,
        [proximoNumero, hoje, tipo_codigo]
      );
    } else {
      await connection.query(
        `INSERT INTO sequenciais_diarios (data_referencia, tipo_codigo, ${nomeColunaNum}) VALUES (?, ?, ?)`,
        [hoje, tipo_codigo, proximoNumero]
      );
    }

    // 3. Inserir na tabela senhas (SEM enviar o campo 'codigo', pois é gerado pelo MySQL!)
    const [colunasSenhas] = await connection.query('SHOW COLUMNS FROM senhas');
    const colNumSenha = colunasSenhas.find(c => 
      (c.Field.includes('num') || c.Field.includes('seq')) && c.Field !== 'codigo'
    );

    let resultadoInsercao;
    // Se a tabela senhas tiver uma coluna numérica para guardar o sequencial, nós enviamos
    if (colNumSenha) {
      [resultadoInsercao] = await connection.query(
        `INSERT INTO senhas (tipo_codigo, data_referencia, ${colNumSenha.Field}) VALUES (?, ?, ?)`,
        [tipo_codigo, hoje, proximoNumero]
      );
    } else {
      // Caso contrário, enviamos só o essencial
      [resultadoInsercao] = await connection.query(
        `INSERT INTO senhas (tipo_codigo, data_referencia) VALUES (?, ?)`,
        [tipo_codigo, hoje]
      );
    }

    const senhaId = resultadoInsercao.insertId;

    // 4. Recuperar o código final que o banco de dados gerou
    const dataFormatada = hoje.replace(/-/g, '').slice(2);
    const numeroFormatado = String(proximoNumero).padStart(3, '0');
    let codigoFinal = `${dataFormatada}-${tipo_codigo}${numeroFormatado}`; // Previsão caso a busca falhe

    // Tenta ir buscar o código real criado pelo MySQL
    if (senhaId) {
      const [senhaCriada] = await connection.query(
        'SELECT codigo FROM senhas WHERE id = ?',
        [senhaId]
      );
      if (senhaCriada.length > 0 && senhaCriada[0].codigo) {
        codigoFinal = senhaCriada[0].codigo;
      }
    }

    await connection.commit();
    connection.release();

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Senha emitida com sucesso!',
      dados: {
        id: senhaId,
        codigo: codigoFinal, // Aqui já devolvemos o código perfeitamente gerado!
        tipo: tipo_codigo,
        estado: 'EMITIDA'
      }
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Erro ao emitir senha:', error);
    return res.status(500).json({ erro: 'Erro interno ao emitir a senha.', detalhe: error.message });
  }
};

module.exports = {
  emitirSenha
};