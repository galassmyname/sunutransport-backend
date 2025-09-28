const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true
  },
  prenom: {
    type: String,
    required: true
  },
  telephone: {
    type: String,
    sparse: true,  // Cela permet d'avoir un numéro unique, mais un autre champ peut aussi être utilisé.
    unique: true
  },
  email: {
    type: String,
    sparse: true, // Cela permet d'avoir un email unique, mais un autre champ peut aussi être utilisé.
    unique: true
  },
  motDePasse: String,
  pinCode: String,
  role: {
    type: String,
    enum: ['voyageur', 'chauffeur', 'admin'],
    default: 'voyageur'  // Le rôle de base sera 'voyageur'
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
