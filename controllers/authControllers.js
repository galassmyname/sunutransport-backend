const jwt = require('jsonwebtoken');
const User = require('../models/User');
const InvalidToken = require('../models/InvalidToken');
const bcrypt = require('bcryptjs');

/**
 * Génère un token JWT avec session illimitée pour tous les rôles
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      role: user.role,
      nom: user.nom,
      prenom: user.prenom
    },
    process.env.JWT_SECRET
  );
};

/**
 * Inscription d'un voyageur avec email ou téléphone
 */
exports.register = async (req, res) => {
  try {
    const { nom, prenom, telephone, email, pinCode } = req.body;

    if (!telephone && !email) {
      return res.status(400).json({ message: "Email ou téléphone requis" });
    }

    if (telephone) {
      const existingUser = await User.findOne({ telephone });
      if (existingUser) {
        return res.status(400).json({ message: "Ce numéro est déjà utilisé" });
      }
    }

    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }
    }

    if (!pinCode || pinCode.length !== 4 || !/^\d+$/.test(pinCode)) {
      return res.status(400).json({ message: "Le code PIN doit contenir 4 chiffres" });
    }

    const hashedPin = await bcrypt.hash(pinCode, 10);

    const user = await User.create({
      nom,
      prenom,
      telephone,
      email,
      pinCode: hashedPin,
      role: 'voyageur'
    });

    const token = generateToken(user);

    res.status(201).json({ 
      message: "Inscription réussie", 
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Connexion avec email ou téléphone
 */
exports.login = async (req, res) => {
  try {
    const { identifier, credential } = req.body;

    const user = await User.findOne({
      $or: [
        { email: identifier },
        { telephone: identifier }
      ]
    }).select('+motDePasse +pinCode');

    if (!user) {
      return res.status(404).json({ message: "Identifiants incorrects" });
    }

    let isAuthenticated = false;

    if (user.role === 'voyageur') {
      isAuthenticated = await bcrypt.compare(credential, user.pinCode);
    } else {
      isAuthenticated = await bcrypt.compare(credential, user.motDePasse);
    }

    if (!isAuthenticated) {
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    const token = generateToken(user);
    
    res.json({ 
      token, 
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role
      },
      expiresIn: null
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Réinitialisation du code PIN pour les voyageurs
 */
exports.requestPinReset = async (req, res) => {
  try {
    const { identifier } = req.body;
    const user = await User.findOne({
      $or: [
        { email: identifier },
        { telephone: identifier }
      ],
      role: 'voyageur'
    });

    if (!user) {
      return res.status(404).json({ message: "Aucun compte voyageur trouvé" });
    }

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpiration = new Date(Date.now() + 15 * 60000); // 15 minutes

    user.pinReset = { token: resetToken, expiresAt: resetExpiration };
    await user.save();

    console.log(`Code de réinitialisation PIN: ${resetToken}`);
    res.json({ 
      message: "Un code de réinitialisation a été généré", 
      userId: user._id 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Réinitialiser le code PIN avec le token
 */
exports.resetPin = async (req, res) => {
  try {
    const { userId, resetToken, newPin } = req.body;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ message: "Le nouveau code PIN doit contenir 4 chiffres" });
    }
    if (!user.pinReset?.token) return res.status(400).json({ message: "Aucune demande de réinitialisation en cours" });
    if (Date.now() > user.pinReset.expiresAt) return res.status(400).json({ message: "Le code a expiré" });
    if (user.pinReset.token !== resetToken) return res.status(400).json({ message: "Code de réinitialisation incorrect" });

    user.pinCode = await bcrypt.hash(newPin, 10);
    user.pinReset = undefined;
    await user.save();

    res.json({ message: "Code PIN réinitialisé avec succès" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Ajouter un utilisateur (chauffeur ou admin)
 */
exports.addUser = async (req, res) => {
  try {
    const { nom, prenom, email, motDePasse, role } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Accès refusé" });
    }

    if (role !== 'chauffeur' && role !== 'admin') {
      return res.status(400).json({ message: "Rôle invalide" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé" });
    }

    const hashed = await bcrypt.hash(motDePasse, 10);
    const user = await User.create({ 
      nom, 
      prenom,
      email, 
      motDePasse: hashed, 
      role 
    });

    res.status(201).json({
      message: "Utilisateur créé avec succès",
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Supprimer un utilisateur
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Accès refusé" });
    }

    if (req.user.id === id) {
      return res.status(400).json({ message: "Vous ne pouvez pas vous supprimer vous-même" });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.status(200).json({ message: "Utilisateur supprimé" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer tous les utilisateurs
 */
exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const users = await User.find().select('-motDePasse -pinCode');
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Déconnexion avec invalidation du token
 */
exports.logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(400).json({ message: "Token requis" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const expiration = new Date(decoded.exp * 1000 || Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

    await InvalidToken.create({ token, expiresAt: expiration });
    res.json({ message: "Déconnexion réussie" });
  } catch (err) {
    res.status(401).json({ message: "Token invalide" });
  }
};

/**
 * Vérifier le token et renvoyer les infos utilisateur
 */
exports.verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Token manquant" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-motDePasse -pinCode');

    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.json({
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role
      }
    });
  } catch (err) {
    res.status(401).json({ message: "Token invalide" });
  }
};