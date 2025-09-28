const Bus = require('../models/Bus');
const Arret = require('../models/Arret');
const Localisation = require('../models/Localisation');

// Recherche globale (bus et arrêts)
exports.globalSearch = async (req, res) => {
  try {
    const { query, type = 'all', limit = 10 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: "La requête doit contenir au moins 2 caractères" });
    }

    const searchTerm = query.toLowerCase().trim();
    const results = [];

    // Recherche des bus
    if (type === 'all' || type === 'bus') {
      const busResults = await Bus.find({
        $or: [
          { nom: { $regex: searchTerm, $options: 'i' } },
          { ligne: { $regex: searchTerm, $options: 'i' } },
          { matricule: { $regex: searchTerm, $options: 'i' } }
        ]
      })
      .populate('chauffeurId', 'nom prenom')
      .limit(limit);

      const busResultsWithPosition = await Promise.all(
        busResults.map(async (bus) => {
          // Obtenir la dernière position
          const lastPosition = await Localisation.findOne({ busId: bus._id })
            .sort({ timestamp: -1 })
            .limit(1);

          return {
            type: 'bus',
            id: bus._id,
            name: `${bus.nom} - Ligne ${bus.ligne}`,
            details: `Matricule: ${bus.matricule}${bus.chauffeurId ? ` | Chauffeur: ${bus.chauffeurId.nom} ${bus.chauffeurId.prenom}` : ''}`,
            data: {
              bus: bus,
              position: lastPosition,
              actif: bus.actif
            }
          };
        })
      );

      results.push(...busResultsWithPosition);
    }

    // Recherche des arrêts
    if (type === 'all' || type === 'arret') {
      const arretResults = await Arret.find({
        nom: { $regex: searchTerm, $options: 'i' }
      })
      .populate({
        path: 'busAssociations.busId',
        select: 'nom ligne matricule actif'
      })
      .limit(limit);

      const arretResultsFormatted = arretResults.map(arret => {
        const lignes = arret.busAssociations
          .filter(assoc => assoc.busId)
          .map(assoc => ({
            ligne: assoc.busId.ligne,
            busNom: assoc.busId.nom,
            direction: assoc.direction,
            ordre: assoc.ordre
          }));

        return {
          type: 'arret',
          id: arret._id,
          name: arret.nom,
          details: lignes.length > 0 
            ? lignes.map(l => `Ligne ${l.ligne}`).join(', ')
            : 'Aucune ligne configurée',
          data: {
            arret: arret,
            lignes: lignes,
            latitude: arret.latitude,
            longitude: arret.longitude
          }
        };
      });

      results.push(...arretResultsFormatted);
    }

    // Recherche par chauffeur si le type est 'bus'
    if (type === 'all' || type === 'bus') {
      const chauffeurResults = await Bus.find({})
        .populate({
          path: 'chauffeurId',
          match: {
            $or: [
              { nom: { $regex: searchTerm, $options: 'i' } },
              { prenom: { $regex: searchTerm, $options: 'i' } }
            ]
          }
        })
        .limit(limit);

      const validChauffeurResults = chauffeurResults
        .filter(bus => bus.chauffeurId)
        .map(bus => ({
          type: 'bus',
          id: bus._id,
          name: `${bus.nom} - Ligne ${bus.ligne}`,
          details: `Chauffeur: ${bus.chauffeurId.nom} ${bus.chauffeurId.prenom} | Matricule: ${bus.matricule}`,
          data: {
            bus: bus,
            actif: bus.actif
          }
        }));

      results.push(...validChauffeurResults);
    }

    // Supprimer les doublons basés sur l'ID
    const uniqueResults = results.reduce((acc, current) => {
      const exists = acc.find(item => item.id === current.id && item.type === current.type);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);

    // Trier les résultats (bus d'abord, puis arrêts, triés par pertinence)
    uniqueResults.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'bus' ? -1 : 1;
      }
      // Tri par pertinence : correspondance exacte en premier
      const aExact = a.name.toLowerCase().includes(searchTerm);
      const bExact = b.name.toLowerCase().includes(searchTerm);
      if (aExact !== bExact) {
        return bExact ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    res.status(200).json({
      success: true,
      query: query,
      type: type,
      count: uniqueResults.length,
      results: uniqueResults.slice(0, limit)
    });

  } catch (err) {
    console.error('Erreur recherche globale:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la recherche',
      error: err.message 
    });
  }
};

// Recherche de bus par ligne avec suggestions
exports.searchBusByLigne = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: "Paramètre de recherche requis" });
    }

    const searchTerm = query.toLowerCase().trim();

    // Recherche exacte et partielle
    const buses = await Bus.find({
      $or: [
        { ligne: { $regex: `^${searchTerm}`, $options: 'i' } }, // Commence par
        { ligne: { $regex: searchTerm, $options: 'i' } },       // Contient
        { nom: { $regex: searchTerm, $options: 'i' } }
      ]
    })
    .populate('chauffeurId', 'nom prenom')
    .sort({ ligne: 1 });

    // Ajouter les positions récentes
    const busesWithPositions = await Promise.all(
      buses.map(async (bus) => {
        const lastPosition = await Localisation.findOne({ busId: bus._id })
          .sort({ timestamp: -1 })
          .limit(1);

        return {
          bus: bus,
          position: lastPosition
        };
      })
    );

    res.status(200).json({
      success: true,
      count: busesWithPositions.length,
      results: busesWithPositions
    });

  } catch (err) {
    console.error('Erreur recherche bus par ligne:', err);
    res.status(500).json({ message: err.message });
  }
};

// Obtenir les suggestions de recherche
exports.getSearchSuggestions = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 1) {
      return res.status(200).json({ suggestions: [] });
    }

    const searchTerm = query.toLowerCase().trim();
    const suggestions = [];

    // Suggestions de lignes
    const lignes = await Bus.find({
      ligne: { $regex: `^${searchTerm}`, $options: 'i' }
    })
    .select('ligne')
    .limit(5)
    .sort({ ligne: 1 });

    lignes.forEach(bus => {
      if (!suggestions.includes(`Ligne ${bus.ligne}`)) {
        suggestions.push(`Ligne ${bus.ligne}`);
      }
    });

    // Suggestions d'arrêts
    const arrets = await Arret.find({
      nom: { $regex: `^${searchTerm}`, $options: 'i' }
    })
    .select('nom')
    .limit(5)
    .sort({ nom: 1 });

    arrets.forEach(arret => {
      suggestions.push(arret.nom);
    });

    res.status(200).json({
      suggestions: suggestions.slice(0, 8)
    });

  } catch (err) {
    console.error('Erreur suggestions:', err);
    res.status(500).json({ suggestions: [] });
  }
};

// Recherche avancée avec filtres géographiques
exports.searchNearby = async (req, res) => {
  try {
    const { lat, lon, radius = 1000, type = 'all' } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ message: "Latitude et longitude requises" });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const radiusInKm = parseInt(radius) / 1000;

    const results = [];

    // Fonction de calcul de distance
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Rayon de la Terre en km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c * 1000; // Distance en mètres
    };

    // Recherche des bus à proximité
    if (type === 'all' || type === 'bus') {
      const recentPositions = await Localisation.aggregate([
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$busId",
            latitude: { $first: "$latitude" },
            longitude: { $first: "$longitude" },
            timestamp: { $first: "$timestamp" }
          }
        },
        {
          $lookup: {
            from: "buses",
            localField: "_id",
            foreignField: "_id",
            as: "bus"
          }
        },
        { $unwind: "$bus" },
        { $match: { "bus.actif": true } }
      ]);

      recentPositions.forEach(pos => {
        const distance = calculateDistance(
          latitude, longitude,
          pos.latitude, pos.longitude
        );

        if (distance <= radius) {
          results.push({
            type: 'bus',
            id: pos.bus._id,
            name: `${pos.bus.nom} - Ligne ${pos.bus.ligne}`,
            distance: Math.round(distance),
            data: {
              bus: pos.bus,
              position: {
                latitude: pos.latitude,
                longitude: pos.longitude,
                timestamp: pos.timestamp
              }
            }
          });
        }
      });
    }

    // Recherche des arrêts à proximité
    if (type === 'all' || type === 'arret') {
      const arrets = await Arret.find({})
        .populate({
          path: 'busAssociations.busId',
          select: 'nom ligne actif'
        });

      arrets.forEach(arret => {
        const distance = calculateDistance(
          latitude, longitude,
          arret.latitude, arret.longitude
        );

        if (distance <= radius) {
          const lignes = arret.busAssociations
            .filter(assoc => assoc.busId)
            .map(assoc => `Ligne ${assoc.busId.ligne}`)
            .join(', ');

          results.push({
            type: 'arret',
            id: arret._id,
            name: arret.nom,
            distance: Math.round(distance),
            data: {
              arret: arret,
              lignes: lignes || 'Aucune ligne',
              latitude: arret.latitude,
              longitude: arret.longitude
            }
          });
        }
      });
    }

    // Trier par distance
    results.sort((a, b) => a.distance - b.distance);

    res.status(200).json({
      success: true,
      center: { latitude, longitude },
      radius: radius,
      count: results.length,
      results: results
    });

  } catch (err) {
    console.error('Erreur recherche proximité:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la recherche de proximité',
      error: err.message 
    });
  }
};

// Obtenir les lignes actives pour la recherche rapide
exports.getActiveLignes = async (req, res) => {
  try {
    const activeBuses = await Bus.find({ actif: true })
      .select('ligne nom')
      .sort({ ligne: 1 });

    const lignes = activeBuses.map(bus => ({
      ligne: bus.ligne,
      nom: bus.nom
    }));

    res.status(200).json({
      success: true,
      count: lignes.length,
      lignes: lignes
    });

  } catch (err) {
    console.error('Erreur lignes actives:', err);
    res.status(500).json({ message: err.message });
  }
};