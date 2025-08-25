const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const userMiddleware = require ('../middlewares/userMiddleware')

router.post('/register', 
    authMiddleware.validateFieldEmail,
    authMiddleware.validateFieldPassword,
    authMiddleware.validateFieldName,
    authMiddleware.validateFieldProfile,
    authMiddleware.userValidation,
    authController.register
);

router.post('/login',
    authMiddleware.validateFieldEmail,
    authMiddleware.validateFieldPassword,
    userMiddleware.userValidation,
    authController.login
);

router.post('/change-password',
    authController.editPassword
);

module.exports = router;
