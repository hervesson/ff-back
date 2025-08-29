const serviceModel = require('../models/serviceModel');

const validateFieldUserId = (request, response, next) => {
    const { body } = request;

    if (body.user_id === undefined) {
        return response.status(400).json({ message: 'O campo "user" e obrigatório!' });
    }

    if (body.user_id === '') {
        return response.status(400).json({ message: 'O campo "user" não pode ser vazio!' });
    }

    next();
};

const validateFielServiceTypeId = (request, response, next) => {
  const { id_services_type } = request.params;

  if (id_services_type === undefined) {
    return response
      .status(400)
      .json({ message: 'O campo "id_services_type" é obrigatório!' });
  }

  if (id_services_type === '') {
    return response
      .status(400)
      .json({ message: 'O campo "id_services_type" não pode ser vazio!' });
  }

  next();
};

const validateFieldDescription = (request, response, next) => {
    const { body } = request;

    if (body.description === undefined) {
        return response.status(400).json({ message: 'O campo "descrição" e obrigatório!' });
    }

    if (body.description === '') {
        return response.status(400).json({ message: 'O campo "descrição" não pode ser vazio!' });
    }

    next();
};

const validateFieldCreationDate = (request, response, next) => {
    const { body } = request;

    if (body.creationDate === undefined) {
        return response.status(400).json({ message: 'O campo "data de criação" e obrigatório!' });
    }

    if (body.creationDate === '') {
        return response.status(400).json({ message: 'O campo "data de criação" não pode ser vazio!' });
    }

    next();
};

const validateFieldType = (request, response, next) => {
    const { body } = request;

    if (body.services_type_id === undefined) {
        return response.status(400).json({ message: 'O campo "tipo" e obrigatório!' });
    }

    if (body.services_type_id === '') {
        return response.status(400).json({ message: 'O campo "tipo" não pode ser vazio!' });
    }

    next();
};

const validateFieldServiceTypeName = (request, response, next) => {
    const { body } = request;

    if (body.name === undefined) {
        return response.status(400).json({ message: 'O campo "name" e obrigatório!' });
    }

    if (body.name === '') {
        return response.status(400).json({ message: 'Digite o nome do novo serviço a ser cadastrado' });
    }

    next();
};

const validateFieldServiceTypeId = (request, response, next) => {
    const { body } = request;

    if (body.id_services_type === undefined) {
        return response.status(400).json({ message: 'O campo "id_services_type" e obrigatório!' });
    }

    if (body.id_services_type === '') {
        return response.status(400).json({ message: 'O campo "id_services_type" não pode ser vazio!' });
    }

    next();
};

const serviceValidation = async (request, response, next) => {
    const { name } = request.body;

    try {
        const usuarioExiste = await serviceModel.serviceAlreadyExists(name);

        if (usuarioExiste) {
            return response.status(409).json({ message: 'Um serviço com esse nome já existe' });
        }

        // Se o usuário não existe, passe para o próximo middleware ou rota
        next();

    } catch (error) {
        console.error('Erro no middleware de validação de usuário:', error);
        return response.status(500).json({ message: 'Erro interno do servidor ao validar usuário.' });
    }
};

const subServiceValidation = async (request, response, next) => {
    const { name } = request.body;

    try {
        const usuarioExiste = await serviceModel.subServiceAlreadyExists(name);

        if (usuarioExiste) {
            return response.status(409).json({ message: 'Um sub tipo com esse nome já existe' });
        }

        // Se o usuário não existe, passe para o próximo middleware ou rota
        next();

    } catch (error) {
        console.error('Erro no middleware de validação de usuário:', error);
        return response.status(500).json({ message: 'Erro interno do servidor ao validar usuário.' });
    }
};

module.exports = { 
    validateFieldUserId, 
    validateFielServiceTypeId,
    validateFieldDescription, 
    subServiceValidation,
    validateFieldCreationDate, 
    validateFieldType, 
    validateFieldServiceTypeName, 
    validateFieldServiceTypeId, 
    serviceValidation 
};
