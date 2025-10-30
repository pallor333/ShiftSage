//Use .env file in config folder
require("dotenv").config({ path: "./config/.env" });

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const passport = require("passport");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const flash = require("express-flash");
const logger = require("morgan");

const connectDB = require("./config/database");
// const mainRoutes = require("./routes/main");
//const postRoutes = require("./routes/posts");
const parkingRoutes = require("./routes/parking");

// Passport config
require("./config/passport")(passport);

//Connect To Database
connectDB();

//Using EJS for views
app.set("view engine", "ejs");

//Static Folder
app.use(express.static("public"));

//Body Parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//Logging
app.use(logger("dev"));

//Use forms for put / delete
app.use(methodOverride("_method"));

//DEBUGGING
// app.use(methodOverride("_method", {
//   methods: ["POST", "GET"] // Allow POST to be converted to DELETE
// }));
// // Add this debug middleware right after methodOverride
// app.use((req, res, next) => {
//   console.log(`Incoming method: ${req.method} (original: ${req.originalMethod})`);
//   next();
// });

// Setup Sessions - stored in MongoDB
app.use(
  session({
    secret: process.env.SESSION_SECRET || "keyboard cat",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.DB_STRING, // Use your MongoDB connection string from .env
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

//Use flash messages for errors, info, ect...
app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

//Debugging
// app.use((req, res, next) => {
//   console.log("Session:", req.session);
//   next();
// });

//Setup Routes For Which The Server Is Listening
// app.use("/", mainRoutes);
//app.use("/post", postRoutes);
app.use("/parking", parkingRoutes)

//Redirects
app.get("/", (req, res) => {
  res.redirect("/parking");
});
// app.get("/login", (req, res) => {
//   res.redirect("login");
// });

//Server Running
app.listen(process.env.PORT, () => {
  console.log("Server is running, you better catch it!");
});
