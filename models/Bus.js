const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
  nom: { 
    type: String, 
    required: true 
  },
  ligne: { 
    type: String, 
    required: true,
    unique: true // Chaque ligne doit être unique
  },
  matricule: { 
    type: String, 
    required: true,
    unique: true 
  },
  chauffeurId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  actif: { 
    type: Boolean, 
    default: false 
  },
  derniereMiseAJour: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});

// Index pour améliorer les performances
busSchema.index({ ligne: 1 });
busSchema.index({ chauffeurId: 1 });
busSchema.index({ actif: 1 });

module.exports = mongoose.model('Bus', busSchema);