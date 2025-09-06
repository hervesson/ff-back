const express = require('express');
const router = express.Router();

const serviceController = require('../controllers/serviceController');
const serviceMiddleware = require ('../middlewares/serviceMiddleware')

router.post('/create-service',
    serviceMiddleware.validateFieldUserId, 
    serviceMiddleware.validateFieldDescription, 
    serviceMiddleware.validateFieldCreationDate,
    serviceMiddleware.validateFieldType,
    serviceController.createService,
);

router.post('/create-service-type',
    serviceMiddleware.serviceValidation,
    serviceMiddleware.validateFieldServiceTypeName,
    serviceController.createServiceType,
);

router.delete('/services-type/:id', 
    serviceController.deleteServiceType
);

router.get('/allServicesType',
    serviceController.getAllServicesType,
);

router.post('/create-service-subtype',
    serviceMiddleware.subServiceValidation,
    serviceMiddleware.validateFieldServiceTypeName,
    serviceMiddleware.validateFieldServiceTypeId,
    serviceController.createServiceSubType,
);

router.delete('/services-subtype/:id', 
    serviceController.deleteServiceSubType
);

router.get('/allServicesSubType/:id_services_type',
    serviceMiddleware.validateFielServiceTypeId,
    serviceController.getAllServicesSubType,
);

router.get('/allServices',
    serviceController.getAllServices
);

router.delete('/services/:id', 
    serviceController.deleteService
);

router.put('/edit-service-type',
    serviceController.updateTypeService
);

module.exports = router;
