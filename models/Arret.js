const mongoose = require('mongoose');
const arretSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  // esp32Id: { type: String, unique: true, required: true }, // SUPPRIMÉ
  busAssociations: [{
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
    ordre: { type: Number, required: true },
    direction: { type: String, default: 'aller' }
  }]
}, { timestamps: true });
arretSchema.index({ 'busAssociations.busId': 1 });
module.exports = mongoose.model('Arret', arretSchema);