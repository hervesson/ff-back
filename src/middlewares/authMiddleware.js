const userModel = require('../models/userModel');

const validateFieldEmail = (request, response, next) => {
    const { body } = request;

    if (body.email === undefined) {
        return response.status(400).json({ message: 'O campo "email" e obrigatório!' });
    }

    if (body.email === '') {
        return response.status(400).json({ message: 'O campo "email" não pode ser vazio!' });
    }

    next();
};

const validateFieldPassword = (request, response, next) => {
    const { body } = request;

    if (body.password === undefined) {
        return response.status(400).json({ message: 'O campo "senha" é obrigatório!' });
    }

    if (body.password === '') {
        return response.status(400).json({ message: 'O campo "senha" não pode ser vazio!' });
    }

    next();
};

const validateFieldName = (request, response, next) => {
    const { body } = request;

    if (body.name === undefined) {
        return response.status(400).json({ message: 'O campo "nome" é obrigatório!' });
    }

    if (body.name === '') {
        return response.status(400).json({ message: 'O campo "nome" não pode ser vazio!' });
    }

    next();
};

const validateFieldProfile = (request, response, next) => {
    const { body } = request;

    if (body.profile_id === undefined) {
        return response.status(400).json({ message: 'O campo "perfil" é obrigatório!' });
    }

    if (body.profile_id === '') {
        return response.status(400).json({ message: 'O campo "perfil" não pode ser vazio!' });
    }

    next();
};

const userValidation = async (request, response, next) => {
    const { body } = request;

    try {
        const usuarioExiste = await userModel.userAlreadyExists(body.email);

        if (usuarioExiste) {
            return response.status(409).json({ message: 'Usuário com este e-mail já existe.' });
        }

        // Se o usuário não existe, passe para o próximo middleware ou rota
        next();

    } catch (error) {
        console.error('Erro no middleware de validação de usuário:', error);
        return response.status(500).json({ message: 'Erro interno do servidor ao validar usuário.' });
    }
};

module.exports = { validateFieldEmail, validateFieldPassword, validateFieldName, validateFieldProfile, userValidation };
