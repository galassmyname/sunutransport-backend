const Localisation = require('../models/Localisation');
const Bus = require('../models/Bus');
const Arret = require('../models/Arret');

// Cache pour les requêtes ETA et suivi des arrêts notifiés
const etaCache = new Map();
const notifiedStops = new Map();

// Fonction de calcul de distance (reste identique)
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Fonction pour vérifier l'arrivée à un arrêt (modifiée)
async function checkBusArrival(busId, lat, lon) {
  try {
    console.log(`Vérification arrivée pour bus: ${busId}`);
    const arrets = await Arret.find({
      'busAssociations.busId': busId
    }).sort({ 'busAssociations.ordre': 1 });
    
    console.log(`Arrêts trouvés: ${arrets.length}`);

    const arrivals = [];
    let nextStopIndex = -1;

    // Trouver le prochain arrêt non encore atteint
    for (let i = 0; i < arrets.length; i++) {
      if (!notifiedStops.has(arrets[i]._id.toString())) {
        nextStopIndex = i;
        break;
      }
    }

    if (nextStopIndex === -1) {
      notifiedStops.clear();
      nextStopIndex = 0;
    }

    if (nextStopIndex >= 0) {
      const arret = arrets[nextStopIndex];
      const distance = calculerDistance(lat, lon, arret.latitude, arret.longitude);
      console.log(`Distance à ${arret.nom}: ${distance * 1000}m`);
      
      if (distance <= 0.05) {
        console.log(`Bus proche de ${arret.nom}`);
        arrivals.push({
          arretId: arret._id,
          arretNom: arret.nom,
          distance: Math.round(distance * 1000),
          timestamp: new Date()
        });
        notifiedStops.set(arret._id.toString(), true);
        
        setTimeout(() => {
          notifiedStops.delete(arret._id.toString());
        }, 300000);
      }
    }

    return arrivals;
  } catch (err) {
    console.error("Erreur checkBusArrival:", err);
    return [];
  }
}

// NOUVELLE FONCTION : Enregistrement de position depuis l'app mobile chauffeur
exports.saveLocalisationFromMobile = async (req, res) => {
  console.log('\n=== Position depuis app mobile chauffeur ===');
  console.log('Utilisateur:', req.user);
  console.log('Corps:', req.body);

  try {
    const { lat, lon, vitesse, precision } = req.body;
    const chauffeurId = req.user.id; // Depuis le middleware d'auth

    // Vérifier que l'utilisateur est un chauffeur
    if (req.user.role !== 'chauffeur') {
      return res.status(403).json({ message: "Accès réservé aux chauffeurs" });
    }

    if (!lat || !lon) {
      return res.status(400).json({ message: "Latitude et longitude obligatoires" });
    }

    // 1. Trouver le bus du chauffeur
    const bus = await Bus.findOne({ chauffeurId }).populate('chauffeurId');
    if (!bus) {
      return res.status(404).json({ message: "Aucun bus assigné à ce chauffeur" });
    }
    console.log(`Bus trouvé: Ligne ${bus.ligne} - ${bus.nom} pour chauffeur ${bus.chauffeurId.nom}`);

    // 2. Activer le bus et mettre à jour la dernière mise à jour
    if (!bus.actif) {
      bus.actif = true;
      console.log(`Bus ligne ${bus.ligne} marqué comme actif`);
      
      if (req.app.locals.broadcastNotification) {
        req.app.locals.broadcastNotification({
          type: 'BUS_ACTIVE',
          data: {
            busId: bus._id,
            ligne: bus.ligne,
            busName: bus.nom,
            chauffeur: `${bus.chauffeurId.nom} ${bus.chauffeurId.prenom}`,
            timestamp: new Date()
          }
        });
      }
    }

    bus.derniereMiseAJour = new Date();
    await bus.save();

    // 3. Vérifier les arrivées
    let arrivals = [];
    const lastPosition = await Localisation.findOne({ busId: bus._id })
      .sort({ timestamp: -1 })
      .limit(1);

    if (lastPosition) {
      const distanceFromLast = calculerDistance(
        lastPosition.latitude,
        lastPosition.longitude,
        lat,
        lon
      );
      
      if (distanceFromLast > 0.02) {
        arrivals = await checkBusArrival(bus._id, lat, lon);
      }
    } else {
      arrivals = await checkBusArrival(bus._id, lat, lon);
    }

    // 4. Enregistrer la position
    const localisationData = {
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      timestamp: new Date(),
      busId: bus._id,
      vitesse: vitesse ? parseFloat(vitesse) : 30,
      precision: precision ? parseFloat(precision) : 5
    };

    const localisation = await Localisation.create(localisationData);
    console.log(`Position enregistrée avec ID: ${localisation._id}`);

    // 5. Préparer la réponse
    const positionWithBusInfo = {
      _id: localisation._id,
      ...localisationData,
      bus: {
        _id: bus._id,
        nom: bus.nom,
        ligne: bus.ligne,
        matricule: bus.matricule,
        actif: bus.actif,
        chauffeur: {
          id: bus.chauffeurId._id,
          nom: bus.chauffeurId.nom,
          prenom: bus.chauffeurId.prenom
        }
      },
      arrivals
    };

    // 6. Broadcast aux clients
    if (req.app.locals.broadcastPosition) {
      req.app.locals.broadcastPosition({
        type: 'POSITION_UPDATE',
        data: positionWithBusInfo
      });
    }

    if (arrivals.length > 0 && req.app.locals.broadcastNotification) {
      arrivals.forEach(arrival => {
        req.app.locals.broadcastNotification({
          type: 'ARRIVAL_NOTIFICATION',
          data: {
            bus: bus.nom,
            ligne: bus.ligne,
            chauffeur: `${bus.chauffeurId.nom} ${bus.chauffeurId.prenom}`,
            arret: arrival.arretNom,
            distance: arrival.distance,
            timestamp: arrival.timestamp
          }
        });
      });
    }

    res.status(201).json({
      success: true,
      message: "Position mise à jour",
      data: positionWithBusInfo
    });
  } catch (err) {
    console.error("Erreur saveLocalisationFromMobile:", err);
    res.status(500).json({ 
      message: "Erreur serveur",
      error: err.message
    });
  }
};

// NOUVELLE FONCTION : Obtenir l'ETA pour le chauffeur
exports.getTempsArriveeForChauffeur = async (req, res) => {
  try {
    const chauffeurId = req.user.id;
    console.log(`Calcul ETA pour chauffeur: ${chauffeurId}`);
    
    // Vérifier que l'utilisateur est un chauffeur
    if (req.user.role !== 'chauffeur') {
      return res.status(403).json({ message: "Accès réservé aux chauffeurs" });
    }

    const bus = await Bus.findOne({ chauffeurId });
    if (!bus) {
      return res.status(404).json({ message: "Aucun bus assigné" });
    }

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Récupérer les dernières positions
    const positions = await Localisation.find({ 
      busId: bus._id,
      timestamp: { $gte: fiveMinutesAgo }
    }).sort({ timestamp: -1 }).limit(5);

    if (positions.length === 0) {
      return res.status(200).json({ 
        message: "Aucune position récente trouvée",
        ligne: bus.ligne,
        busActif: bus.actif,
        arret: "N/A",
        distance: 0,
        tempsArrivee: 0,
        vitesse: 30
      });
    }

    const currentPosition = positions[0];
    const arrets = await Arret.find({ 
      'busAssociations.busId': bus._id 
    }).sort({ 'busAssociations.ordre': 1 });
    
    if (arrets.length === 0) {
      return res.status(200).json({
        message: "Aucun arrêt configuré pour ce bus",
        ligne: bus.ligne,
        busActif: bus.actif,
        arret: "N/A",
        distance: 0,
        tempsArrivee: 0,
        vitesse: currentPosition.vitesse || 30
      });
    }

    // Trouver le prochain arrêt non notifié
    let prochainArret = null;
    for (const arret of arrets) {
      if (!notifiedStops.has(arret._id.toString())) {
        prochainArret = arret;
        break;
      }
    }

    if (!prochainArret) {
      notifiedStops.clear();
      prochainArret = arrets[0];
    }

    const distance = calculerDistance(
      currentPosition.latitude,
      currentPosition.longitude,
      prochainArret.latitude,
      prochainArret.longitude
    );

    const distanceEnMetres = Math.round(distance * 1000);
    const vitesse = currentPosition.vitesse || 30;
    const vitesseEnMS = vitesse / 3.6;
    const tempsEnSecondes = distanceEnMetres / vitesseEnMS;
    const tempsEnMinutes = Math.round(tempsEnSecondes / 60);

    res.status(200).json({
      ligne: bus.ligne,
      busActif: bus.actif,
      busNom: bus.nom,
      arret: prochainArret.nom,
      distance: distanceEnMetres,
      tempsArrivee: Math.max(1, tempsEnMinutes),
      vitesse: vitesse,
      prochainArretId: prochainArret._id
    });

  } catch (err) {
    console.error("Erreur getTempsArriveeForChauffeur:", err);
    res.status(500).json({ 
      message: "Erreur serveur",
      error: err.message
    });
  }
};

// NOUVELLE FONCTION : Activer/Désactiver le service par le chauffeur
exports.toggleServiceStatus = async (req, res) => {
  try {
    const chauffeurId = req.user.id;
    
    if (req.user.role !== 'chauffeur') {
      return res.status(403).json({ message: "Accès réservé aux chauffeurs" });
    }

    const bus = await Bus.findOne({ chauffeurId }).populate('chauffeurId');
    if (!bus) {
      return res.status(404).json({ message: "Aucun bus assigné" });
    }
    
    bus.actif = !bus.actif;
    bus.derniereMiseAJour = new Date();
    await bus.save();
    
    if (req.app.locals.broadcastNotification) {
      req.app.locals.broadcastNotification({
        type: bus.actif ? 'BUS_ACTIVE' : 'BUS_INACTIVE',
        data: {
          busId: bus._id,
          ligne: bus.ligne,
          busName: bus.nom,
          chauffeur: `${bus.chauffeurId.nom} ${bus.chauffeurId.prenom}`,
          newStatus: bus.actif,
          timestamp: new Date()
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: `Service ligne ${bus.ligne} ${bus.actif ? 'activé' : 'désactivé'}`,
      bus: {
        id: bus._id,
        ligne: bus.ligne,
        nom: bus.nom,
        actif: bus.actif,
        derniereMiseAJour: bus.derniereMiseAJour
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// FONCTION MODIFIÉE : Vérification des bus inactifs basée sur derniereMiseAJour
async function checkInactiveBuses() {
  try {
    const activeBuses = await Bus.find({ actif: true }).populate('chauffeurId');
    const now = new Date();
    
    for (const bus of activeBuses) {
      const minutesDiff = (now - bus.derniereMiseAJour) / (1000 * 60);
      
      if (minutesDiff > 10) { // 10 minutes d'inactivité
        bus.actif = false;
        await bus.save();
        console.log(`Bus ligne ${bus.ligne} désactivé (inactif depuis ${Math.round(minutesDiff)} minutes)`);
        
        // Notifier via WebSocket si possible
        if (global.broadcastNotification) {
          global.broadcastNotification({
            type: 'BUS_INACTIVE',
            data: {
              busId: bus._id,
              ligne: bus.ligne,
              busName: bus.nom,
              chauffeur: bus.chauffeurId ? `${bus.chauffeurId.nom} ${bus.chauffeurId.prenom}` : 'N/A',
              lastUpdate: bus.derniereMiseAJour
            }
          });
        }
      }
    }
  } catch (err) {
    console.error('Erreur vérification bus inactifs:', err);
  }
}

// Lancer le contrôle périodique toutes les 5 minutes
setInterval(checkInactiveBuses, 5 * 60 * 1000);

// FONCTION POUR OBTENIR LE STATUT DU CHAUFFEUR
exports.getChauffeurStatus = async (req, res) => {
  try {
    const chauffeurId = req.user.id;
    
    if (req.user.role !== 'chauffeur') {
      return res.status(403).json({ message: "Accès réservé aux chauffeurs" });
    }

    const bus = await Bus.findOne({ chauffeurId }).populate('chauffeurId');
    if (!bus) {
      return res.status(404).json({ message: "Aucun bus assigné" });
    }

    // Récupérer la dernière position
    const lastPosition = await Localisation.findOne({ busId: bus._id })
      .sort({ timestamp: -1 })
      .limit(1);

    res.status(200).json({
      chauffeur: {
        id: bus.chauffeurId._id,
        nom: bus.chauffeurId.nom,
        prenom: bus.chauffeurId.prenom
      },
      bus: {
        id: bus._id,
        ligne: bus.ligne,
        nom: bus.nom,
        matricule: bus.matricule,
        actif: bus.actif,
        derniereMiseAJour: bus.derniereMiseAJour
      },
      lastPosition: lastPosition || null
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getRecentPositions = async (req, res) => {
  try {
    const Localisation = require('../models/Localisation');
    
    const positions = await Localisation.aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$busId",
          latitude: { $first: "$latitude" },
          longitude: { $first: "$longitude" },
          vitesse: { $first: "$vitesse" },
          timestamp: { $first: "$timestamp" },
          precision: { $first: "$precision" }
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
      {
        $lookup: {
          from: "users",
          localField: "bus.chauffeurId",
          foreignField: "_id",
          as: "chauffeur"
        }
      },
      { $unwind: "$chauffeur" },
      {
        $project: {
          _id: 1,
          latitude: 1,
          longitude: 1,
          vitesse: 1,
          timestamp: 1,
          precision: 1,
          bus: {
            _id: "$bus._id",
            nom: "$bus.nom",
            ligne: "$bus.ligne", // Ajout de la ligne
            matricule: "$bus.matricule",
            actif: "$bus.actif",
            chauffeur: {
              id: "$chauffeur._id",
              nom: "$chauffeur.nom",
              prenom: "$chauffeur.prenom"
            }
          }
        }
      }
    ]);

    const activeOnly = req.query.active === 'true';
    const filteredPositions = activeOnly 
      ? positions.filter(pos => pos.bus.actif)
      : positions;

    // Trier par ligne pour un meilleur affichage
    filteredPositions.sort((a, b) => {
      const ligneA = parseInt(a.bus.ligne) || 9999;
      const ligneB = parseInt(b.bus.ligne) || 9999;
      return ligneA - ligneB;
    });

    res.status(200).json(filteredPositions);
  } catch (err) {
    console.error("Erreur getRecentPositions :", err.message);
    res.status(500).json({ message: err.message });
  }
};