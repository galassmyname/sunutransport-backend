const Bus = require('../models/Bus');
const User = require('../models/User');
const Arret = require('../models/Arret');

exports.getStats = async (req, res) => {
  try {
    const buses = await Bus.countDocuments();
    const chauffeurs = await User.countDocuments({ role: 'chauffeur' });
    const voyageur = await User.countDocuments({ role: 'voyageur' });
    const arrets = await Arret.countDocuments();

    res.status(200).json({ buses, chauffeurs, voyageur, arrets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};