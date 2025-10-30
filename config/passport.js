const LocalStrategy = require("passport-local").Strategy;
const mongoose = require("mongoose");
const User = require("../models/User");

module.exports = function (passport) {
  passport.use(
    new LocalStrategy({ usernameField: 'userName' }, async (userName, password, done) => {
      try {
        const user = await User.findOne({ userName });
        if (!user) {
          return done(null, false, { msg: `Username ${userName} not found.` });
        }

        if (!user.passwordHash) {
          return done(null, false, {
            msg: "Your account was registered using a sign-in provider. To enable password login, sign in using a provider, and then set a password under your user profile.",
          });
        }

        const isMatch = await user.validatePassword(password);
        if (isMatch) {
          return done(null, user);
        } else {
          return done(null, false, { msg: "Invalid username or password." });
        }
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};
