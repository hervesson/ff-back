const db = require('../config/db');

const createService = async (user_id, condominium_id, sub_services_id, description, title, services_type_id, creationDate, files ) => {
    try {
        const result = await db.execute('INSERT INTO logs (user_id, condominium_id, sub_services_id,  description, title, services_type_id, creationDate, files ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [user_id, condominium_id, sub_services_id, description, title, services_type_id, creationDate, JSON.stringify(files), ])
        return result 
    } catch (error) {
        console.error('Erro ao registrar serviço:', error);
        throw error;
    }
}

const serviceAlreadyExists = async (service) => {
    try {
        const [result] = await db.execute('SELECT name FROM services_type WHERE name = ?', [service]);
        return result.length > 0
    } catch (error) {
        console.error('Erro ao verificar usuário:', error);
        throw error;
    }
}

const subServiceAlreadyExists = async (service) => {
    try {
        const [result] = await db.execute('SELECT name FROM sub_services_type WHERE name = ?', [service]);
        return result.length > 0
    } catch (error) {
        console.error('Erro ao verificar usuário:', error);
        throw error;
    }
}


const createServiceType = async (name) => {
    try {
        const result = await db.execute('INSERT INTO services_type ( name ) VALUES (?)', [ name ])
        return result 
    } catch (error) {
        console.error('Erro ao registrar serviço:', error);
        throw error;
    }
}

const getAllServicesType = async () => {
  try {
    const [result] = await db.execute('SELECT * FROM services_type');
    return result; 
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    throw error;
  }
};

const createServiceSubType = async (name, id_services_type) => {
    try {
        const result = await db.execute('INSERT INTO sub_services_type ( name, id_services_type ) VALUES (?, ?)', [ name, id_services_type ])
        return result 
    } catch (error) {
        console.error('Erro ao registrar serviço:', error);
        throw error;
    }
}

const getAllServicesSubType = async (id_services_type) => {
  try {
    const [result] = await db.execute(
      'SELECT * FROM sub_services_type WHERE id_services_type = ?',
      [id_services_type]
    );
    return result;
  } catch (error) {
    console.error('Erro ao buscar sub serviços:', error);
    throw error;
  }
};


const getAllServices = async (condominium_id, services_type_id, sub_services_id, user_id, startDate, endDate) => {
  try {
    let query = `
      SELECT 
        l.id AS log_id,
        l.title,
        l.description,
        l.files,
        l.services_type_id,
        st.name AS type_name,                 -- nome do tipo
        l.sub_services_id,
        l.user_id,
        sst.name AS sub_type_name,            -- nome do sub tipo (pode vir NULL)
        l.created_at,
        l.creationDate,
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
      LEFT JOIN services_type st ON l.services_type_id = st.id
      LEFT JOIN sub_services_type sst ON l.sub_services_id = sst.id
      WHERE 1=1
    `;


    const params = [];

    if (condominium_id) {
      query += ' AND l.condominium_id = ?';
      params.push(condominium_id);
    }

    if (services_type_id) {
      query += ' AND l.services_type_id = ?';
      params.push(services_type_id);
    }

    if (sub_services_id) {
      query += ' AND l.sub_services_id = ?';
      params.push(sub_services_id);
    }

    if (user_id) {
      query += ' AND l.user_id = ?';
      params.push(user_id);
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

module.exports = { 
  createService, 
  createServiceType, 
  getAllServicesType, 
  createServiceSubType, 
  getAllServicesSubType, 
  subServiceAlreadyExists,
  getAllServices, 
  deleteService, 
  serviceAlreadyExists 
}