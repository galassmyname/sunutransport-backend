// authMiddlewares.js
const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification
 * Vérifie le token JWT et ajoute les infos user à la requête
 */
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "Token requis" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token invalide" });
  }
};