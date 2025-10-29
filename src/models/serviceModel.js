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

const getAllServicesType = async (searchTerm = '') => {
  try {
    let query = 'SELECT * FROM services_type';
    let params = [];

    if (searchTerm) {
      query += ' WHERE name LIKE ?';
      params.push(`%${searchTerm}%`);
    }

    query += ' ORDER BY name ASC';

    // Busca os serviços principais
    const [services] = await db.execute(query, params);

    // Busca todos os sub serviços
    const [subServices] = await db.execute('SELECT * FROM sub_services_type');

    // Junta services + subServices
    const servicesWithSubs = services.map(service => {
      return {
        ...service,
        sub_services: subServices.filter(
          sub => sub.id_services_type === service.id
        )
      };
    });

    return servicesWithSubs;
  } catch (error) {
    console.error('Erro ao buscar tipos de serviço:', error);
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

const getAllServicesSubType = async (id_services_type, searchTerm = '') => {
  try {
    let query = 'SELECT * FROM sub_services_type WHERE id_services_type = ?';
    let params = [id_services_type];

    if (searchTerm) {
      query += ' AND name LIKE ?';
      params.push(`%${searchTerm}%`);
    }

    query += ' ORDER BY name ASC';

    const [result] = await db.execute(query, params);
    return result;
  } catch (error) {
    console.error('Erro ao buscar sub serviços:', error);
    throw error;
  }
};

// model
const getAllServices = async (
  condominium_id,
  services_type_id,
  sub_services_id,
  user_id,
  startDate,
  endDate,
  { page, pageSize }
) => {
  try {
    const filters = [];
    const params = [];
    const pushIf = (cond, sql, val) => { if (cond) { filters.push(sql); params.push(val); } };

    // evita '', null, undefined
    pushIf(condominium_id !== undefined && condominium_id !== '', 'l.condominium_id = ?', condominium_id);
    pushIf(services_type_id !== undefined && services_type_id !== '', 'l.services_type_id = ?', services_type_id);
    pushIf(sub_services_id !== undefined && sub_services_id !== '', 'l.sub_services_id = ?', sub_services_id);
    pushIf(user_id !== undefined && user_id !== '', 'l.user_id = ?', user_id);
    pushIf(startDate, 'l.created_at >= ?', startDate);
    pushIf(endDate, 'l.created_at <= ?', endDate);

    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

    // paginação (literal, sem placeholders)
    const limit  = Math.max(parseInt(pageSize, 10) || 20, 1);
    const offset = Math.max(((parseInt(page, 10) || 1) - 1) * limit, 0);

    // COUNT
    const countSql = `SELECT COUNT(*) AS total FROM logs l ${where}`;
    let countRows;
    if (params.length > 0) {
      [countRows] = await db.execute(countSql, params);
    } else {
      [countRows] = await db.execute(countSql); // 👈 sem segundo argumento
    }
    const total = countRows?.[0]?.total ?? 0;

    // DATA
    const dataSql = `
      SELECT 
        l.id AS log_id,
        l.title,
        l.description,
        l.files,
        l.services_type_id,
        st.name AS type_name,
        l.sub_services_id,
        sst.name AS sub_type_name,
        l.user_id,
        u.name AS user_name,
        u.email AS user_email,
        c.id AS condominium_id,
        c.name AS condominium_name,
        l.created_at,
        l.creationDate
      FROM logs l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN condominium c ON l.condominium_id = c.id
      LEFT JOIN services_type st ON l.services_type_id = st.id
      LEFT JOIN sub_services_type sst ON l.sub_services_id = sst.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ${offset}, ${limit}
    `;
    let rows;
    if (params.length > 0) {
      [rows] = await db.execute(dataSql, params);
    } else {
      [rows] = await db.execute(dataSql); // 👈 sem segundo argumento
    }

    return { rows, total };
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

const deleteServiceType = async (logId) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM services_type WHERE id = ?',
      [logId]
    );
    return result; 
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    throw error;
  }
};

const deleteServiceSubType = async (logId) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM sub_services_type WHERE id = ?',
      [logId]
    );
    return result; 
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    throw error;
  }
};

const updateTypeService = async (name, id) => {
  try {
    const [result] = await db.execute(
      'UPDATE services_type SET name = ? WHERE id = ?',
      [name, id]
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error('Erro ao atualizar tipo de serviço:', error);
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
  deleteServiceType,
  deleteServiceSubType,
  serviceAlreadyExists,
  updateTypeService
}