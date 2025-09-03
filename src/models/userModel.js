const db = require('../config/db');

const userAlreadyExists = async (email) => {
    try {
        const [result] = await db.execute('SELECT email FROM users WHERE email = ?', [email]);
        return result.length > 0
    } catch (error) {
        console.error('Erro ao verificar usuário:', error);
        throw error;
    }
}

const getUser = async (email) => {
    try {
        const [result] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        return result[0]
    } catch (error) {
        console.error('Erro ao verificar usuário:', error);
        throw error;
    }
}

const getAllUsers = async (searchTerm = '') => {
  try {
    let query = 'SELECT * FROM users';
    let params = [];

    if (searchTerm) {
      query += ' WHERE name LIKE ?';
      params.push(`%${searchTerm}%`);
    }

    query += ' ORDER BY name ASC';

    const [result] = await db.execute(query, params);
    return result;
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    throw error;
  }
};

module.exports = { userAlreadyExists, getUser, getAllUsers }