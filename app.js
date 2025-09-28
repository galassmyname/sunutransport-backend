const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Import des routes
const busRoutes = require('./routes/busRoutes');
const arretRoutes = require('./routes/arretRoutes');
const localisationRoutes = require('./routes/localisationRoutes');
const authRoutes = require('./routes/authRoutes');
const statsRoutes = require('./routes/statsRoutes');
// Utilisation des routes
app.use('/api/bus', busRoutes);
app.use('/api/arret', arretRoutes);
app.use('/api/localisation', localisationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', statsRoutes);

  module.exports = app;

