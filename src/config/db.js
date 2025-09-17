require('dotenv').config();
const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER || process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z'
});

(async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ Conectado ao MySQL!');
    connection.release();
  } catch (err) {
    console.error('❌ Erro inicial ao conectar ao MySQL:', err.message);
    // não mata o processo; o pool tentará novas conexões
  }
})();

module.exports = db;
