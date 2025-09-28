const mongoose = require('mongoose');
const localisationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  timestamp: { type: Date, default: Date.now },
  busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' }, // Maintenant lié au bus plutôt qu'au chauffeur
  vitesse: Number, // Vitesse du bus pour calculer le temps d'arrivée
  precision: Number // Précision du signal GPS
});
module.exports = mongoose.model('Localisation', localisationSchema);