const pool = require('../config/db');

// Função para emitir uma nova senha (Totem)
const emitirSenha = async (req, res) => {
  const { tipo_codigo } = req.body; // Ex: 'SP' (Preferencial), 'SG' (Geral), etc.

  if (!tipo_codigo) {
    return res.status(400).json({ erro: 'O código do tipo de senha é obrigatório.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verificar se o tipo de senha existe
    const [tipos] = await connection.query(
      'SELECT * FROM tipos_senha WHERE codigo = ?',
      [tipo_codigo]
    );

    if (tipos.length === 0) {
      await connection.release();
      return res.status(404).json({ erro: 'Tipo de senha inválido.' });
    }

    // 2. Gerar ou incrementar o sequencial diário para o tipo e data atual
    const hoje = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD

    let [seqs] = await connection.query(
      'SELECT ultimo_numero FROM sequenciais_diarios WHERE data = ? AND tipo_codigo = ? FOR UPDATE',
      [hoje, tipo_codigo]
    );

    let proximoNumero = 1;
    if (seqs.length > 0) {
      proximoNumero = seqs[0].ultimo_numero + 1;
      await connection.query(
        'UPDATE sequenciais_diarios SET ultimo_numero = ? WHERE data = ? AND tipo_codigo = ?',
        [proximoNumero, hoje, tipo_codigo]
      );
    } else {
      await connection.query(
        'INSERT INTO sequenciais_diarios (data, tipo_codigo, ultimo_numero) VALUES (?, ?, ?)',
        [hoje, tipo_codigo, proximoNumero]
      );
    }

    // 3. Formatar o código da senha (Ex: 260601-SP001)
    const dataFormatada = hoje.replace(/-/g, '').slice(2); // YYMMDD
    const numeroFormatado = String(proximoNumero).padStart(3, '0');
    const codigoSenha = `${dataFormatada}-${tipo_codigo}${numeroFormatado}`;

    // 4. Inserir a senha na tabela principal
    const [resultadoInsercao] = await connection.query(
      `INSERT INTO senhas (codigo, tipo_codigo, estado_codigo, prioridade, criada_em) 
       VALUES (?, ?, 'EMITIDA', ?, NOW(3))`,
      [codigoSenha, tipo_codigo, tipos[0].peso_prioridade || 0]
    );

    const senhaId = resultadoInsercao.insertId;

    // 5. Registar no histórico (conforme regras append-only do projeto)
    await connection.query(
      `INSERT INTO senha_historico (senha_id, estado_anterior, estado_novo, criado_por_tipo, criado_por_id, criado_em) 
       VALUES (?, NULL, 'EMITIDA', 'S', NULL, NOW(3))`,
      [senhaId]
    );

    await connection.commit();
    connection.release();

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Senha emitida com sucesso!',
      dados: {
        id: senhaId,
        codigo: codigoSenha,
        tipo: tipo_codigo,
        estado: 'EMITIDA',
        criada_em: new Date()
      }
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Erro ao emitir senha:', error);
    return res.status(500).json({ erro: 'Erro interno ao emitir a senha.' });
  }
};

module.exports = {
  emitirSenha
};