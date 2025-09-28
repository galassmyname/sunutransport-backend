require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

// Initialisation de l'application Express
const app = express();
const server = http.createServer(app);

// Configuration WebSocket
const wss = new WebSocket.Server({ server });

// Gestion des connexions WebSocket
wss.on('connection', (ws) => {
  console.log('Nouveau client WebSocket connecté');

  ws.on('close', () => {
    console.log('Client WebSocket déconnecté');
  });
});

// Fonction pour diffuser les positions aux clients
function broadcastPosition(position) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'POSITION_UPDATE',
        data: position
      }));
    }
  });
}

// Fonction pour diffuser les notifications d'arrivée
function broadcastNotification(notification) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(notification));
    }
  });
}

// Middlewares
app.use(cors());
app.use(express.json());

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connecté à MongoDB'))
  .catch(err => console.error('Erreur de connexion à MongoDB:', err));

// Routes (gérées par les fichiers séparés dans le dossier routes)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/bus', require('./routes/busRoutes'));
app.use('/api/arret', require('./routes/arretRoutes'));
app.use('/api/localisation', require('./routes/localisationRoutes'));
app.use('/api', require('./routes/statsRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));

// Expose les fonctions de broadcast pour les contrôleurs
app.locals.broadcastPosition = broadcastPosition;
app.locals.broadcastNotification = broadcastNotification;

// Création d'un admin par défaut (si aucun n'existe)
const createDefaultAdmin = async () => {
  try {
    const User = require('./models/User');
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        nom: 'Admin',
        email: 'admin@example.com',
        motDePasse: hashedPassword,
        role: 'admin'
      });
      console.log('Administrateur par défaut créé');
    }
  } catch (err) {
    console.error('Erreur création admin:', err.message);
  }
};

// Démarrer le serveur
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  await createDefaultAdmin();
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
  server.close(() => process.exit(1));
});