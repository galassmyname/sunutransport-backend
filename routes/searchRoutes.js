const express = require('express');
const router = express.Router();

const {
  globalSearch,
  searchBusByLigne,
  getSearchSuggestions,
  searchNearby,
  getActiveLignes
} = require('../controllers/searchController');

// Routes de recherche
router.get('/', globalSearch);                    // Recherche globale
router.get('/suggestions', getSearchSuggestions); // Suggestions de recherche
router.get('/bus/ligne', searchBusByLigne);      // Recherche spécifique par ligne
router.get('/nearby', searchNearby);             // Recherche géographique
router.get('/lignes/active', getActiveLignes);   // Lignes actives

module.exports = router;