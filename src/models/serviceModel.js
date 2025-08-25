const db = require('../config/db');



const createService = async (user_id, condominium_id, description, title, type, files ) => {
    try {
        const result = await db.execute('INSERT INTO logs (user_id, condominium_id, description, title, type, files ) VALUES (?, ?, ?, ?, ?, ?)', [user_id, condominium_id, description, title, type, JSON.stringify(files), ])
        return result 
    } catch (error) {
        console.error('Erro ao registrar serviço:', error);
        throw error;
    }
}

const getAllServices = async (condominium_id, type, startDate, endDate) => {
  try {
    let query = `
      SELECT 
        l.id AS log_id,
        l.title,
        l.description,
        l.files,
        l.type,
        l.created_at,
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email,
        u.profile_id AS user_profile,
        c.id AS condominium_id,
        c.name AS condominium_name,
        c.cnpj AS condominium_cnpj,
        c.phone AS condominium_phone
      FROM logs l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN condominium c ON l.condominium_id = c.id
      WHERE 1=1
    `;

    const params = [];

    if (condominium_id) {
      query += ' AND l.condominium_id = ?';
      params.push(condominium_id);
    }

    if (type) {
      query += ' AND l.type = ?';
      params.push(type);
    }

    if (startDate) {
      query += ' AND l.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND l.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY l.created_at DESC';

    const [rows] = await db.execute(query, params);

    // transforma files JSON em array

    return rows;

  } catch (error) {
    console.error('Erro ao buscar logs:', error);
    throw error;
  }
};



const deleteService = async (logId) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM logs WHERE id = ?',
      [logId]
    );
    return result; 
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    throw error;
  }
};





module.exports = { createService, getAllServices, deleteService }