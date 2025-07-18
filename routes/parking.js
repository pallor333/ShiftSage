const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
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

///////////////// Routes for Shift Sage
// Displaying dashboard page
router.get("/home", parkingController.getHomePage);
// Routes for edit, overtime, schedule, holiday
router.get("/edit", ensureAuth, parkingController.getEditPage);
router.get("/overtime", ensureAuth, parkingController.getOvertimePage);
router.get("/schedule", ensureAuth, parkingController.getSchedulePage);
router.get("/holiday", ensureAuth, parkingController.getHolidayPage);
// Button to calculate overtime bids
router.get("/overtime/calculate", ensureAuth, parkingController.calculateOvertimeBid);

// GET routes to gather monitor/location/shifts from DB
// /home/monitor/:id = /home/monitor/12345
router.get("/monitor/:id", ensureAuth, parkingController.getMonitor);
router.get("/location/:id", ensureAuth, parkingController.getLocation);
router.get("/shift/:id", ensureAuth, parkingController.getRegularShift);

// POST routes to add new entries
router.post("/monitor", ensureAuth, parkingController.addMonitor)
router.post("/location", ensureAuth, parkingController.addLocation)
router.post("/regularShift", ensureAuth, parkingController.addRegularShift)
router.post("/openShift", ensureAuth, parkingController.addOpenShift)
router.post("/vacation", ensureAuth, parkingController.addVacation)
router.post("/holiday", ensureAuth, parkingController.addHoliday)

// POST routes to edit entries
router.post("/monitor/edit/:id", ensureAuth, parkingController.updateMonitor);
router.post("/openShift/edit/:id", ensureAuth, parkingController.updateOpenShift);
router.post("/overtime/rank/:id", ensureAuth, parkingController.updateOvertimeBid);
router.post("/regularShift/edit/:id", ensureAuth, parkingController.updateRegularShift);

// router.get("/shift/edit/:id", ensureAuth, parkingController.editShift);
// router.get("/location/edit/:id", ensureAuth, parkingController.editLocation);

// Delete routes to delete entries
router.post("/monitor/delete/:id", ensureAuth, parkingController.deleteMonitor);
router.post("/location/delete/:id", ensureAuth, parkingController.deleteLocation);
router.post("/regularShift/delete/:id", ensureAuth, parkingController.deleteRegularShift);
router.post("/openShift/delete/:id", ensureAuth, parkingController.deleteOpenShift);
router.post('/monitor/deleteAllVacation/:id', ensureAuth, parkingController.deleteAllVacation);
router.post('/monitor/deleteOneVacation', ensureAuth, parkingController.deleteOneVacation);
router.post("/overtime/deleteBid/:id", ensureAuth, parkingController.deleteOvertimeBid);
router.get("/overtime/deleteOvertimeAuditWinners", ensureAuth, parkingController.deleteOvertimeAuditWinners);
router.post("/holiday/deleteHoliday/:id", ensureAuth, parkingController.deleteHoliday)


module.exports = router;
