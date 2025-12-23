const db = require('../config/db');

const createCondominium = async (name, cnpj, sistemaDeGestao, tipoDeUnidade, trustee, phone) => {
  try {
    const result = await db.execute('INSERT INTO condominium (name, cnpj, sistema_de_gestao, tipo_de_unidade, trustee, phone) VALUES (?, ?, ?, ?, ?, ?)', [name, cnpj, sistemaDeGestao, tipoDeUnidade, trustee, phone])
    return result
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    throw error;
  }
}

const getAllCondominiuns = async (searchTerm = '') => {
  try {
    let query = 'SELECT * FROM condominium';
    let params = [];

    if (searchTerm) {
      query += ' WHERE name LIKE ?';
      params.push(`%${searchTerm}%`);
    }

    query += ' ORDER BY name ASC';

    const [result] = await db.execute(query, params);
    return result;
  } catch (error) {
    console.error('Erro ao buscar condomínios:', error);
    throw error;
  }
};

const updateCondominium = async (id, fields) => {
  try {
    const setClause = Object.keys(fields).map(key => `${key} = ?`).join(', ');
    const values = Object.values(fields);

    const [result] = await db.execute(
      `UPDATE condominium SET ${setClause} WHERE id = ?`,
      [...values, id]
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error('Erro ao atualizar condomínio:', error);
    throw error;
  }
};



module.exports = { createCondominium, getAllCondominiuns, updateCondominium }