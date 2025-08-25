const db = require('../config/db');

const createCondominium = async (name, cnpj, trustee, phone) => {
    try {
        const result = await db.execute('INSERT INTO condominium (name, cnpj, trustee, phone) VALUES (?, ?, ?, ?)', [name, cnpj, trustee, phone])
        return result 
    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        throw error;
    }
}

const getAllCondominiuns = async () => {
  try {
    const [result] = await db.execute('SELECT * FROM condominium');
    return result; 
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
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