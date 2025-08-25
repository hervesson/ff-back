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


module.exports = { validateFieldUserId, validateFieldCondominiumId, validateFieldDescription, validateFieldTitle, validateFieldType };
