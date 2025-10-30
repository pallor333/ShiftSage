const passport = require("passport");
const validator = require("validator");
const User = require("../models/User");

const getLogin = (req, res) => {
  if (req.user) {
    return res.redirect("home");
  }
  res.render("login", {
    title: "Login",
  });
};

const postLogin = (req, res, next) => {
  const validationErrors = [];
  if (validator.isEmpty(req.body.userName)) {
    console.log("Validator: 'userName' field is blank")
    validationErrors.push({ msg: "Username cannot be blank." });
  }
  if (validator.isEmpty(req.body.password)) {
    console.log("Validator: 'password' field is blank")
    validationErrors.push({ msg: "Password cannot be blank." });
  }
  if (validator.isEmpty(req.body.confirmPassword)) {
    console.log("Validator: 'confirmPassword' field is blank")
    validationErrors.push({ msg: "Passwords must match." });
  }
  if (!validator.equals(req.body.password, req.body.confirmPassword)) {
    console.log("Validator: 'confirmPassword' does not match 'password'")
    validationErrors.push({ msg: "Passwords must match." });
  }
    

  if (validationErrors.length) {
    req.flash("errors", validationErrors);
    return res.redirect("login");
  }

  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      req.flash("errors", info);
      return res.redirect("login");
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", { msg: "Success! You are logged in." });
      // res.redirect(req.session.returnTo || "/profile");
      res.redirect(req.session.returnTo || "home");
    });
  })(req, res, next);
};

const logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      console.error("Error during logout:", err);
      return next(err);
    }
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return next(err);
      }
      // Clear the session cookie
      res.clearCookie("connect.sid");
      // Redirect to the homepage
      res.redirect("/");
    });
  });
};


const getSignup = (req, res) => {
  if (req.user) {
    return res.redirect("home");
  }
  res.render("signup", {
    title: "Create Account",
  });
};

const postSignup = async(req, res, next) => {
  const validationErrors = [];
  if (!validator.isEmpty(req.body.userName))
    validationErrors.push({msg: "Please enter a valid username."});
  if (!validator.isLength(req.body.password, { min: 7 }))
    validationErrors.push({
      msg: "Password must be at least 7 characters long",
    });
  if (req.body.password !== req.body.confirmPassword)
    validationErrors.push({ msg: "Passwords do not match" });

  if (validationErrors.length) {
    req.flash("errors", validationErrors);
    return res.redirect("signup");
  }


  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ userName: req.body.userName });
    if (existingUser) {
      req.flash("errors", { msg: "An account with that username already exists." });
      return res.redirect("signup");
    }

    // Create a new user
    const newUser = new User({
      userName: req.body.userName,
      password: req.body.password,
    });

    await newUser.save();

    req.logIn(newUser, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", { msg: "You have successfully signed up!" });
      // res.redirect(req.session.returnTo || "/profile");
      res.redirect(req.session.returnTo || "home");
    });
  } catch (err) {
    console.error(err);
    res.redirect("signup");
  }
};

module.exports = {
  getLogin, 
  postLogin, 
  logout, 
  getSignup, 
  postSignup
};