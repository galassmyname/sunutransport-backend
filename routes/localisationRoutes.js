const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddlewares');
const {
  saveLocalisationFromMobile,
  getTempsArriveeForChauffeur,
  toggleServiceStatus,
  getChauffeurStatus,
  getRecentPositions
} = require('../controllers/localisationControllers');

// Routes pour les chauffeurs (protégées par authentification)
router.post('/mobile', authMiddleware, saveLocalisationFromMobile);
router.get('/eta/chauffeur', authMiddleware, getTempsArriveeForChauffeur);
router.post('/toggle-service', authMiddleware, toggleServiceStatus);
router.get('/chauffeur/status', authMiddleware, getChauffeurStatus);

// Routes publiques
router.get('/recent', getRecentPositions);

module.exports = router;
