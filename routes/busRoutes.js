const express = require('express');
const router = express.Router();

const {
    getAllBus,
    getBusById,
    createBus,
    updateBus,
    deleteBus,
    getBusByChauffeurId,
    getBusByLigne,
    getLignesActives,
    searchBusByLigne
} = require('../controllers/busControllers');

// Routes principales
router.get('/', getAllBus); // Obtenir tous les bus
router.get('/search', searchBusByLigne); // Rechercher des bus par ligne (doit être avant /:id)
router.get('/actives', getLignesActives); // Obtenir les lignes actives
router.get('/:id', getBusById); // Obtenir un bus spécifique par ID
router.post('/', createBus); // Créer un nouveau bus
router.put('/:id', updateBus); // Modifier un bus par ID
router.delete('/:id', deleteBus); // Supprimer un bus par ID

// Routes spécialisées
router.get('/chauffeur/:chauffeurId', getBusByChauffeurId); // Obtenir le bus d'un chauffeur
router.get('/ligne/:ligne', getBusByLigne); // Obtenir un bus par numéro de ligne

module.exports = router;