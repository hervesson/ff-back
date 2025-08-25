const express = require('express');
const router = express.Router();

const serviceController = require('../controllers/serviceController');
const serviceMiddleware = require ('../middlewares/serviceMiddleware')

router.post('/create-service',
    serviceMiddleware.validateFieldUserId, 
    serviceMiddleware.validateFieldCondominiumId, 
    serviceMiddleware.validateFieldDescription, 
    serviceMiddleware.validateFieldTitle,
    serviceMiddleware.validateFieldType,
    serviceController.createService,
);

router.get('/allServices',
    serviceController.getAllServices
);

router.delete('/services/:id', 
    serviceController.deleteService
);

module.exports = router;
