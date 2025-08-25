
const serviceModel = require('../models/serviceModel')

const createService = async (req, res) => {
  const { user_id, condominium_id, description, title, type, files } = req.body;

  await serviceModel.createService(user_id, condominium_id, description, title, type, files)

  res.status(201).json({ message: 'Serviço registrado com sucesso' });
};

const getAllServices = async (req, res) => {
  const { condominium_id, type, startDate, endDate } = req.query;
  try {
    const users = await serviceModel.getAllServices( condominium_id, type, startDate, endDate);

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


const deleteService = async (req, res) => {
  const logId = req.params.id;

  try {
    const users = await serviceModel.deleteService(logId);
    
    res.status(200).json({ message: 'Log deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar log:', error);
    res.status(500).json({ error: 'Erro ao deletar log', details: error.message });
  }
};



module.exports = { createService, getAllServices, deleteService };
