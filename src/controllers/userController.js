const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userModel = require('../models/userModel')

const getAllUsers = async (req, res) => {
  const searchTerm = req.query.search || '';
  try {
    const users = await userModel.getAllUsers(searchTerm);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar usuários' });
  }
};

module.exports = {
  getAllUsers
};
