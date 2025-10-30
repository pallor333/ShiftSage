const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const authController = require("../controllers/auth");
const homeController = require("../controllers/home");
const parkingController = require("../controllers/parking");
const { ensureAuth, ensureGuest } = require("../middleware/auth");

//Post Routes - simplified for now
//Since linked from server.js treat as path as:
//post/:id, post/createPost, post/likePost/:id, post/deletePost/:id
// router.get("/:id", ensureAuth, postsController.getPost);
// //enables user to create post w/ cloudinary for media uploads
// router.post("/createPost", upload.single("file"), postsController.createPost);
// //Enables user to like post. In controller, uses POST model to update likes by 1. 
// router.put("/likePost/:id", postsController.likePost);
// //Enables uesr to delete post. In controller uses POSt model to delete post from mongoDB collection.
// router.delete("/deletePost/:id", ensureAuth, postsController.deletePost);

//Main Routes - simplified for now
router.get("/", homeController.getIndex);

//Routes for user login/signup
router.get("/login", authController.getLogin);
router.post("/login", authController.postLogin);
router.get("/logout", authController.logout);
router.get("/signup", authController.getSignup);
router.post("/signup", authController.postSignup);

///////////////// Routes for Shift Sage
// Displaying dashboard page
router.get("/home", ensureAuth, parkingController.getHomePage);
// Routes for edit, overtime, schedule, holiday
router.get("/edit", ensureAuth, parkingController.getEditPage);
router.get("/overtime", ensureAuth, parkingController.getOvertimePage);
router.get("/schedule", ensureAuth, parkingController.getSchedulePage);
router.get("/holiday", ensureAuth, parkingController.getHolidayPage);
router.get("/quickstart", ensureAuth, parkingController.getQuickstartPage);
router.get("/exportovertime", ensureAuth, parkingController.getExportOvertimePage);
// Button to calculate overtime bids
router.get("/overtime/calculate", ensureAuth, parkingController.calculateOvertimeBid);
router.get("/extraOT", ensureAuth, parkingController.getExtraOTPage);
router.get("/finalize", ensureAuth, parkingController.getFinalizePage);
router.get("/mongo", ensureAuth, parkingController.getMongoPage);
//Export/Import Mongo Data
router.get("/mongo/export", parkingController.exportMongoData);
router.post("/mongo/import", parkingController.importMongoData);



// GET routes to gather monitor/location/shifts from DB
// /home/monitor/:id = /home/monitor/12345
// router.get("/monitor/:id", ensureAuth, parkingController.getMonitor);
// router.get("/location/:id", ensureAuth, parkingController.getLocation);
// router.get("/shift/:id", ensureAuth, parkingController.getRegularShift);

// POST routes to add new entries
router.post("/monitor", ensureAuth, parkingController.addMonitor)
router.post("/location", ensureAuth, parkingController.addLocation)
router.post("/regularShift", ensureAuth, parkingController.addRegularShift)
router.post("/openShift", ensureAuth, parkingController.addOpenShift)
// router.post("/vacation", ensureAuth, parkingController.addVacation)
router.post("/holiday", ensureAuth, parkingController.addHoliday)
router.post("/extraOT", ensureAuth, parkingController.addExtraOT)
// router.post("/sick", ensureAuth, parkingController.addSick)
router.post("/blackoutDate", ensureAuth, parkingController.addBlackoutDate)
router.post("/timeOff", ensureAuth, parkingController.addTimeOff)

// POST routes to edit entries 
router.put("/monitor/:id", ensureAuth, parkingController.updateMonitor);
router.put("/openShift/:id", ensureAuth, parkingController.updateOpenShift);
router.put("/overtime/rank/:id", ensureAuth, parkingController.updateOvertimeBid);
router.put("/regularShift/:id", ensureAuth, parkingController.updateRegularShift);
router.put("/regularShift/:id", ensureAuth, parkingController.updateRegularShift);
//UPDATE entries
router.put("/finalize", ensureAuth, parkingController.updateFinalizeHours);
router.put("/extraOT", ensureAuth, parkingController.updateExtraOT);

// router.get("/shift/edit/:id", ensureAuth, parkingController.editShift);
// router.get("/location/edit/:id", ensureAuth, parkingController.editLocation);

// Delete routes to delete entries
router.delete("/monitor/:id", ensureAuth, parkingController.deleteMonitor);
router.delete("/location/:id", ensureAuth, parkingController.deleteLocation);
router.delete("/regularShift/:id", ensureAuth, parkingController.deleteRegularShift);
router.delete("/openShift/:id", ensureAuth, parkingController.deleteOpenShift);
router.delete('/monitor/allVacation/:id', ensureAuth, parkingController.deleteAllVacation);
router.delete('/monitor/oneVacation/:id', ensureAuth, parkingController.deleteOneVacation);
router.delete("/overtime/:id", ensureAuth, parkingController.deleteOvertimeBid);
router.delete("/overtime/auditWinners", ensureAuth, parkingController.deleteOvertimeAuditWinners);
router.delete("/holiday/:id", ensureAuth, parkingController.deleteHoliday)
router.delete("/extraOT/:id", ensureAuth, parkingController.deleteExtraOT)
// router.delete("/extraOT/:id", ensureAuth, parkingController.deleteExtraOT)
router.delete('/monitor/allSick/:id', ensureAuth, parkingController.deleteAllSick);
router.delete('/monitor/oneSick', ensureAuth, parkingController.deleteOneSick);
router.delete("/holiday/blackoutDate/:id", ensureAuth, parkingController.deleteBlackoutDate)

router.delete("/monitor/:id", ensureAuth, parkingController.deleteMonitor);


module.exports = router;
