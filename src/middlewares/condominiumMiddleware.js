const userModel = require('../models/userModel');

const validateFieldName = (request, response, next) => {
    const { body } = request;

    if (body.name === undefined) {
        return response.status(400).json({ message: 'O campo "name" e obrigatório!' });
    }

    if (body.name === '') {
        return response.status(400).json({ message: 'O campo "name" não pode ser vazio!' });
    }

    next();
};

const validateFieldCnpj = (request, response, next) => {
    const { body } = request;

    if (body.cnpj === undefined) {
        return response.status(400).json({ message: 'O campo "cnpj" e obrigatório!' });
    }

    if (body.cnpj === '') {
        return response.status(400).json({ message: 'O campo "cnpj" não pode ser vazio!' });
    }

    next();
};

const validateFieldTrustee = (request, response, next) => {
    const { body } = request;

    if (body.trustee === undefined) {
        return response.status(400).json({ message: 'O campo "síndico" e obrigatório!' });
    }

    if (body.trustee === '') {
        return response.status(400).json({ message: 'O campo "síndico" não pode ser vazio!' });
    }

    next();
};

const validateFieldPhone = (request, response, next) => {
    const { body } = request;

    if (body.phone === undefined) {
        return response.status(400).json({ message: 'O campo "contato" e obrigatório!' });
    }

    if (body.phone === '') {
        return response.status(400).json({ message: 'O campo "contato" não pode ser vazio!' });
    }

    next();
};


module.exports = { validateFieldName, validateFieldCnpj, validateFieldTrustee, validateFieldPhone };
