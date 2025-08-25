const express = require('express');
const router = express.Router();

const condominiumController = require('../controllers/condominiumController');
const condominiumMiddleware = require ('../middlewares/condominiumMiddleware')

router.post('/create-condominium',
    condominiumMiddleware.validateFieldName, 
    condominiumMiddleware.validateFieldCnpj, 
    condominiumMiddleware.validateFieldTrustee, 
    condominiumMiddleware.validateFieldPhone,
    condominiumController.createCondominium,
);


router.get('/allCondominiuns',
    condominiumController.getAllCondominiuns
);

router.put('/condominium/:id', condominiumController.editCondominium);


module.exports = router;
