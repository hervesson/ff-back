
const serviceModel = require('../models/serviceModel')

const createService = async (req, res) => {
  const { user_id, condominium_id, sub_services_id, description, title, services_type_id, files } = req.body;

  await serviceModel.createService(user_id, condominium_id, sub_services_id, description, title, services_type_id, files)

  res.status(201).json({ message: 'Serviço registrado com sucesso' });
};

const createServiceType = async (req, res) => {
  const { name } = req.body;

  const service =  await serviceModel.createServiceType(name)

  res.status(201).json({ id: service[0].insertId, name: name });
};

const getAllServicesType = async (req, res) => {
  try {
    const servicesType = await serviceModel.getAllServicesType();

    res.status(200).json({
      success: true,
      count: servicesType.length,
      data: servicesType,
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar usuários' });
  }
};

const createServiceSubType = async (req, res) => {
  const { name, id_services_type } = req.body;

  const service =  await serviceModel.createServiceSubType(name, id_services_type)

  res.status(201).json({ id: service[0].insertId, name: name });
};

const getAllServicesSubType = async (req, res) => {
  const { id_services_type } = req.params;
  try {
    const servicesType = await serviceModel.getAllServicesSubType(id_services_type);

    res.status(200).json({
      success: true,
      count: servicesType.length,
      data: servicesType,
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar usuários' });
  }
};

const getAllServices = async (req, res) => {
  const { condominium_id, services_type_id, sub_services_id, user_id, startDate, endDate } = req.query;
  try {
    const users = await serviceModel.getAllServices( condominium_id, services_type_id, sub_services_id, user_id, startDate, endDate);

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



module.exports = { createService, createServiceType, getAllServicesType, createServiceSubType, getAllServicesSubType, getAllServices, deleteService };
