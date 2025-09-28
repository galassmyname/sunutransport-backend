const express = require('express');
const router = express.Router();
const authController = require('../controllers/authControllers');
const authMiddleware = require('../middlewares/authMiddlewares');

// Authentification voyageur
router.post('/register', authController.register);
router.post('/login', authController.login);

// Gestion du PIN
router.post('/request-pin-reset', authController.requestPinReset);
router.post('/reset-pin', authController.resetPin);

// Administration (protégé par middleware)
router.post('/add-user', authMiddleware, authController.addUser);
router.delete('/user/:id', authMiddleware, authController.deleteUser);
router.get('/users', authMiddleware, authController.getAllUsers);

// Gestion de session
router.post('/logout', authMiddleware, authController.logout);
router.get('/verify-token', authMiddleware, authController.verifyToken); // Nouvelle route

module.exports = router;