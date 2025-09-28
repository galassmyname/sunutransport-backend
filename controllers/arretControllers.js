const Arret = require('../models/Arret');
const Bus = require('../models/Bus');

exports.createArret = async (req, res) => {
  try {
    const { nom, latitude, longitude, busAssociations } = req.body;
    
    if (!nom || !latitude || !longitude) {
      return res.status(400).json({ 
        message: "Les champs nom, latitude et longitude sont obligatoires" 
      });
    }

    const arret = new Arret({ 
      nom, 
      latitude, 
      longitude,
      busAssociations: busAssociations || []
    });

    await arret.save();
    
    const arretWithBusInfo = await Arret.findById(arret._id)
      .populate({
        path: 'busAssociations.busId',
        populate: {
          path: 'chauffeurId',
          select: 'nom prenom'
        }
      });
    
    res.status(201).json(arretWithBusInfo);
  } catch (err) {
    res.status(500).json({ 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

exports.updateArret = async (req, res) => {
  try {
    const { nom, latitude, longitude, busAssociations } = req.body;
    
    const updateData = {
      nom,
      latitude,
      longitude,
      busAssociations: busAssociations || []
    };

    const arret = await Arret.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true }
    ).populate({
      path: 'busAssociations.busId',
      populate: {
        path: 'chauffeurId',
        select: 'nom prenom'
      }
    });
    
    if (!arret) {
      return res.status(404).json({ message: "Arrêt non trouvé" });
    }
    
    res.status(200).json(arret);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ FONCTION CORRIGÉE : Filtrage strict par direction
exports.getArretsByBus = async (req, res) => {
  try {
    const { busId } = req.params;
    // ✅ Utiliser 'sens' depuis query params (cohérent avec l'appli Flutter)
    const { sens = 'aller' } = req.query;

    console.log(`🔍 Recherche arrêts pour busId: ${busId}, sens: ${sens}`);

    // Trouver tous les arrêts qui ont ce busId dans leurs associations
    const arrets = await Arret.find({
      'busAssociations.busId': busId
    })
    .populate({
      path: 'busAssociations.busId',
      populate: {
        path: 'chauffeurId',
        select: 'nom prenom'
      }
    });

    console.log(`📍 Arrêts trouvés (avant filtrage): ${arrets.length}`);

    // ✅ FILTRAGE STRICT PAR DIRECTION
    const arretsFiltered = [];
    
    for (const arret of arrets) {
      // Trouver l'association qui correspond au busId ET à la direction demandée
      const validAssociation = arret.busAssociations.find(assoc => {
        const associationBusId = assoc.busId._id.toString();
        const associationDirection = (assoc.direction || '').toLowerCase().trim();
        
        const busIdMatch = associationBusId === busId;
        const directionMatch = associationDirection === sens.toLowerCase().trim();
        
        console.log(`   Arrêt "${arret.nom}": busId=${busIdMatch}, direction="${associationDirection}"=="${sens}" → ${directionMatch}`);
        
        return busIdMatch && directionMatch;
      });

      // Si une association valide est trouvée, ajouter l'arrêt avec l'ordre approprié
      if (validAssociation) {
        const arretObject = arret.toObject();
        arretObject.ordre = validAssociation.ordre || 0;
        arretsFiltered.push(arretObject);
        
        console.log(`   ✅ Arrêt "${arret.nom}" ajouté (ordre: ${arretObject.ordre})`);
      }
    }

    // Trier par ordre
    arretsFiltered.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    console.log(`📍 Arrêts finaux (après filtrage et tri): ${arretsFiltered.length}`);
    arretsFiltered.forEach((a, i) => console.log(`   ${i + 1}. ${a.nom} (ordre: ${a.ordre})`));

    res.status(200).json(arretsFiltered);
  } catch (err) {
    console.error('❌ Erreur getArretsByBus:', err);
    res.status(500).json({ message: err.message });
  }
};

// Nouvelle fonction pour obtenir les arrêts par ligne de bus
exports.getArretsByLigne = async (req, res) => {
  try {
    const { ligne } = req.params;
    const { direction = 'aller' } = req.query;
    
    console.log(`🔍 Recherche arrêts pour ligne: ${ligne}, direction: ${direction}`);
    
    // Trouver d'abord le bus par ligne
    const bus = await Bus.findOne({ ligne });
    if (!bus) {
      return res.status(404).json({ 
        message: `Aucun bus trouvé pour la ligne ${ligne}` 
      });
    }

    console.log(`🚌 Bus trouvé: ${bus._id} pour ligne ${ligne}`);

    // Utiliser la fonction getArretsByBus pour obtenir les arrêts filtrés
    req.params.busId = bus._id.toString();
    req.query.sens = direction;
    
    // Appeler la fonction de filtrage
    await this.getArretsByBus(req, res);
    
  } catch (err) {
    console.error('❌ Erreur getArretsByLigne:', err);
    res.status(500).json({ message: err.message });
  }
};

exports.getArrets = async (req, res) => {
  try {
    const arrets = await Arret.find()
      .populate({
        path: 'busAssociations.busId',
        populate: {
          path: 'chauffeurId',
          select: 'nom prenom'
        }
      })
      .sort({ nom: 1 });
    
    res.status(200).json(arrets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Fonction pour obtenir les arrêts avec informations de ligne
exports.getArretsWithLigneInfo = async (req, res) => {
  try {
    const arrets = await Arret.find()
      .populate({
        path: 'busAssociations.busId',
        populate: {
          path: 'chauffeurId',
          select: 'nom prenom'
        }
      })
      .sort({ nom: 1 });
    
    // Enrichir les données avec les informations de ligne
    const arretsWithLigneInfo = arrets.map(arret => {
      const arretObj = arret.toObject();
      arretObj.lignes = [];
      
      arret.busAssociations.forEach(assoc => {
        if (assoc.busId && assoc.busId.ligne) {
          const ligneInfo = {
            ligne: assoc.busId.ligne,
            busNom: assoc.busId.nom,
            direction: assoc.direction,
            ordre: assoc.ordre,
            chauffeur: assoc.busId.chauffeurId ? {
              nom: assoc.busId.chauffeurId.nom,
              prenom: assoc.busId.chauffeurId.prenom
            } : null
          };
          
          arretObj.lignes.push(ligneInfo);
        }
      });
      
      // Trier les lignes par numéro
      arretObj.lignes.sort((a, b) => {
        const ligneA = parseInt(a.ligne) || 9999;
        const ligneB = parseInt(b.ligne) || 9999;
        return ligneA - ligneB;
      });
      
      return arretObj;
    });
    
    res.status(200).json(arretsWithLigneInfo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};