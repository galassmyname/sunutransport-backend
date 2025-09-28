const express = require('express');
const router = express.Router();
const {
  getArrets,
  createArret,
  updateArret,
  getArretsByBus,
  getArretsByLigne,
  getArretsWithLigneInfo
} = require('../controllers/arretControllers');

// Routes pour les arrêts
router.get('/', getArrets); // Obtenir tous les arrêts
router.get('/with-ligne-info', getArretsWithLigneInfo); // Obtenir les arrêts avec info des lignes
router.post('/', createArret); // Créer un nouveau arrêt
router.put('/:id', updateArret); // Modifier un arrêt

// Routes spécialisées
router.get('/bus/:busId', getArretsByBus); // Obtenir les arrêts d'un bus
router.get('/ligne/:ligne', getArretsByLigne); // Obtenir les arrêts d'une ligne


module.exports = router;