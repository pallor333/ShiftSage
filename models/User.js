const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userName: { type: String, unique: true, lowercase: true, trim: true },
  passwordHash: String
});

UserSchema.methods.setPassword = async function(pw) {
  this.passwordHash = await bcrypt.hash(pw, 10);
}

UserSchema.methods.validatePassword = function(pw) {
  return bcrypt.compare(pw, this.passwordHash);
}

UserSchema.methods.hasPassword() = async function() {
  return this.passwordHash && this.passwordHash.length;
}


module.exports = mongoose.model("User", UserSchema);
