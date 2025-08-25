const userModel = require('../models/userModel');

const userValidation = async (request, response, next) => {
    const { body } = request;

    try {
        const usuarioExiste = await userModel.userAlreadyExists(body.email);

        if (!usuarioExiste) {
            return response.status(409).json({ message: 'Este usuário não foi encontrado em nossa base!' });
        }

        // Se o usuário não existe, passe para o próximo middleware ou rota
        next();

    } catch (error) {
        console.error('Erro no middleware de validação de usuário:', error);
        return response.status(500).json({ message: 'Erro interno do servidor ao validar usuário.' });
    }
};

module.exports = { userValidation };
