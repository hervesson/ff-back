require('dotenv').config();
const mysql = require('mysql2/promise');;

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT, // importante se não for 3306
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

(async () => {
  try {
      const connection = await db.getConnection();
      console.log('Conectado ao MySQL!');
      connection.release(); // Libera a conexão de volta para o pool
  } catch (err) {
      console.error('Erro ao conectar ao MySQL:', err);
  }
})();

module.exports = db;
