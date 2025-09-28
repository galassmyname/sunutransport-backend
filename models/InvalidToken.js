const mongoose = require('mongoose');

const invalidTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('InvalidToken', invalidTokenSchema);