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

const getAllUsers = async () => {
  try {
    const [result] = await db.execute('SELECT * FROM users');
    return result; 
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    throw error;
  }
};





module.exports = { userAlreadyExists, getUser, getAllUsers }