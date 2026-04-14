const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  name: String,
  passHash: String,
  refreshTokenHash: String, 
});


module.exports = mongoose.model("User", userSchema);