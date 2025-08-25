const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const authModel = require('../models/authModel')
const userModel = require('../models/userModel')

const register = async (req, res) => {
  const { email, name, profile_id, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  await authModel.register(email, name, profile_id,  hash)

  res.status(201).json({ message: 'Usuário registrado com sucesso' });
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await userModel.getUser(email);

    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ id: user.id, token, user });

  } catch (error) {
    console.error('Erro no middleware de validação de usuário:', error);
    return res.status(500).json({ message: 'Erro interno do servidor ao validar usuário.' });
  }
};

const editPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    // Aqui você deve fazer hash da senha antes de salvar:
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updated = await authModel.updatePassword(email, hashedPassword);

    if (!updated) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.status(200).json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao editar senha:', error);
    res.status(500).json({ message: 'Erro ao editar senha' });
  }
};


module.exports = {
  register,
  login,
  editPassword
};
