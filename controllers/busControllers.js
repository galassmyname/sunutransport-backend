const Bus = require('../models/Bus');
const Localisation = require('../models/Localisation');

exports.createBus = async (req, res) => {
  try {
    const { nom, ligne, matricule, chauffeurId } = req.body;
    
    // Validation des champs requis
    if (!nom || !ligne || !matricule || !chauffeurId) {
      return res.status(400).json({ 
        message: "Les champs nom, ligne, matricule et chauffeurId sont obligatoires" 
      });
    }

    // Vérifier qu'un seul bus par chauffeur
    const existingBusForChauffeur = await Bus.findOne({ chauffeurId });
    if (existingBusForChauffeur) {
      return res.status(400).json({ 
        message: "Ce chauffeur a déjà un bus assigné" 
      });
    }

    // Vérifier que la ligne n'existe pas déjà
    const existingLigne = await Bus.findOne({ ligne });
    if (existingLigne) {
      return res.status(400).json({ 
        message: `La ligne ${ligne} existe déjà` 
      });
    }

    // Vérifier que le matricule n'existe pas déjà
    const existingMatricule = await Bus.findOne({ matricule });
    if (existingMatricule) {
      return res.status(400).json({ 
        message: `Le matricule ${matricule} existe déjà` 
      });
    }

    const newBus = new Bus({ 
      nom, 
      ligne,
      matricule, 
      chauffeurId,
      actif: false,
      derniereMiseAJour: new Date()
    });
    
    await newBus.save();
    
    const populatedBus = await Bus.findById(newBus._id).populate('chauffeurId');
    res.status(201).json(populatedBus);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      const value = err.keyValue[field];
      return res.status(400).json({ 
        message: `${field === 'ligne' ? 'Ligne' : 'Matricule'} ${value} existe déjà` 
      });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.updateBus = async (req, res) => {
  try {
    const { nom, ligne, matricule, chauffeurId } = req.body;
    const busId = req.params.id;

    // Vérifier que le bus existe
    const existingBus = await Bus.findById(busId);
    if (!existingBus) {
      return res.status(404).json({ message: "Bus non trouvé" });
    }

    // Vérifier les doublons seulement si les valeurs changent
    if (ligne && ligne !== existingBus.ligne) {
      const existingLigne = await Bus.findOne({ ligne, _id: { $ne: busId } });
      if (existingLigne) {
        return res.status(400).json({ 
          message: `La ligne ${ligne} existe déjà` 
        });
      }
    }

    if (matricule && matricule !== existingBus.matricule) {
      const existingMatricule = await Bus.findOne({ matricule, _id: { $ne: busId } });
      if (existingMatricule) {
        return res.status(400).json({ 
          message: `Le matricule ${matricule} existe déjà` 
        });
      }
    }

    if (chauffeurId && chauffeurId !== existingBus.chauffeurId.toString()) {
      const existingChauffeur = await Bus.findOne({ chauffeurId, _id: { $ne: busId } });
      if (existingChauffeur) {
        return res.status(400).json({ 
          message: "Ce chauffeur a déjà un bus assigné" 
        });
      }
    }

    const bus = await Bus.findByIdAndUpdate(busId, {
      nom,
      ligne,
      matricule,
      chauffeurId,
      derniereMiseAJour: new Date()
    }, { new: true }).populate('chauffeurId');
    
    res.status(200).json(bus);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      const value = err.keyValue[field];
      return res.status(400).json({ 
        message: `${field === 'ligne' ? 'Ligne' : 'Matricule'} ${value} existe déjà` 
      });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.deleteBus = async (req, res) => {
  try {
    const bus = await Bus.findByIdAndDelete(req.params.id);
    if (!bus) {
      return res.status(404).json({ message: "Bus non trouvé" });
    }
    
    // Supprimer aussi les localisations associées
    await Localisation.deleteMany({ busId: req.params.id });
    
    res.status(200).json({ 
      message: `Bus ligne ${bus.ligne} supprimé avec succès` 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getBusById = async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.id).populate('chauffeurId');
    if (!bus) {
      return res.status(404).json({ message: "Bus non trouvé" });
    }
    res.status(200).json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllBus = async (req, res) => {
  try {
    const { sortBy = 'ligne', order = 'asc' } = req.query;
    const sortOrder = order === 'desc' ? -1 : 1;
    
    const busList = await Bus.find()
      .populate('chauffeurId')
      .sort({ [sortBy]: sortOrder });
    
    res.status(200).json(busList);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getBusByChauffeurId = async (req, res) => {
  try {
    const { chauffeurId } = req.params;
    
    const bus = await Bus.findOne({ chauffeurId }).populate('chauffeurId');
    
    if (!bus) {
      return res.status(404).json({ 
        message: "Aucun bus trouvé pour ce chauffeur" 
      });
    }
    
    res.status(200).json(bus);
  } catch (err) {
    res.status(500).json({ 
      message: err.message 
    });
  }
};

// Nouvelle fonction pour obtenir un bus par ligne
exports.getBusByLigne = async (req, res) => {
  try {
    const { ligne } = req.params;
    
    const bus = await Bus.findOne({ ligne }).populate('chauffeurId');
    
    if (!bus) {
      return res.status(404).json({ 
        message: `Aucun bus trouvé pour la ligne ${ligne}` 
      });
    }
    
    res.status(200).json(bus);
  } catch (err) {
    res.status(500).json({ 
      message: err.message 
    });
  }
};

// Nouvelle fonction pour obtenir les lignes actives
exports.getLignesActives = async (req, res) => {
  try {
    const lignesActives = await Bus.find({ actif: true })
      .populate('chauffeurId')
      .sort({ ligne: 1 });
    
    res.status(200).json(lignesActives);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Fonction pour rechercher des bus par ligne (recherche partielle)
exports.searchBusByLigne = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ 
        message: "Paramètre de recherche requis" 
      });
    }

    const buses = await Bus.find({
      $or: [
        { ligne: { $regex: query, $options: 'i' } },
        { nom: { $regex: query, $options: 'i' } }
      ]
    }).populate('chauffeurId').sort({ ligne: 1 });
    
    res.status(200).json(buses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};