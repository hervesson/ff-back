const userModel = require('../models/userModel');

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

const validateFieldCondominiumId = (request, response, next) => {
    const { body } = request;

    if (body.condominium_id === undefined) {
        return response.status(400).json({ message: 'O campo "condominio" e obrigatório!' });
    }

    if (body.condominium_id === '') {
        return response.status(400).json({ message: 'O campo "condominio" não pode ser vazio!' });
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

const validateFieldTitle = (request, response, next) => {
    const { body } = request;

    if (body.title === undefined) {
        return response.status(400).json({ message: 'O campo "título" e obrigatório!' });
    }

    if (body.title === '') {
        return response.status(400).json({ message: 'O campo "título" não pode ser vazio!' });
    }

    next();
};

const validateFieldType = (request, response, next) => {
    const { body } = request;

    if (body.type === undefined) {
        return response.status(400).json({ message: 'O campo "tipo" e obrigatório!' });
    }

    if (body.type === '') {
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
        return response.status(400).json({ message: 'O campo "name" não pode ser vazio!' });
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


module.exports = { validateFieldUserId, validateFieldCondominiumId, validateFieldDescription, validateFieldTitle, validateFieldType, validateFieldServiceTypeName, validateFieldServiceTypeId };
