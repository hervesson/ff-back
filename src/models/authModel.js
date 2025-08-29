const db = require('../config/db');

const register = async (email, name, profile_id,  hash) => {
    try {
        const result = await db.execute('INSERT INTO users (email, name, profile_id, password) VALUES (?, ?, ?, ?)', [email, name, profile_id,  hash])
        return result 
    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        throw error;
    }
}

const updatePassword = async (name, email, newPassword) => {
  try {
    const [result] = await db.execute(
      'UPDATE users SET name = ?, password = ? WHERE email = ?',
      [name, newPassword, email]
    );

    return result.affectedRows > 0; // true se atualizou
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    throw error;
  }
};



module.exports = { register, updatePassword }