// Importing the schemas from the DB in models/Parking.js
const { Monitor, Location, OpenShift, OvertimeAudit, OvertimeBid, OvertimeSchedule, RegularShift} = require("../models/Parking")
// const { findById } = require("../models/User")
const { calculateShiftHours, formatDate, getNextThurs } = require('../utils/dateHelpers')
const { allocateOvertime } = require('../services/overtimeServices') //Import business logic from Service layer
const { allocateSchedule } = require('../services/scheduleServices') //Import business logic from Service layer
//Can fetch related objects now
//const monitor = await Monitor.findById(monitorId).populate('regularShifts currentLocation');

//const [month, day, year] = [new Date().getMonth() + 1, new Date().getDate(), new Date().getFullYear()];
//console.log(`${month}/${day}/${year}`); // "5/22/2025"
//temp hardcoding date:
const THISWEEK = new Date("4/30/25")
// const TESTWEEK = new Date() //Gets the current date from the user
// Map full day to a shortened format. 
const DAYMAPPING = { Monday: "MON", Tuesday: "TUE", Wednesday: "WED", Thursday: "THU", Friday: "FRI", Saturday: "SAT", Sunday: "SUN",};
const DAYSARRAY = ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"]

// Helper function to fetch data from DB
const fetchCommonData = async () => {
  try {
    const monitors = await Monitor.find().populate("regularShift location").sort( {id: 1});
    const regularShifts = await RegularShift.find().sort({ name: 1 }) // 1 for ascending order
    const openShifts = await OpenShift.find().populate("location").sort({ date: 1, startTime: 1});
    const locations = await Location.find().sort({ name: 1});
    const overtimeBid = await OvertimeBid.find().populate("monitor").populate("rankings.position")
    const overtimeAudit = await OvertimeAudit.find()

    return { monitors, regularShifts, openShifts, locations, overtimeBid, overtimeAudit };
  } catch (err) {
    console.error("Error fetching common data:", err);
    throw err; // Rethrow the error to handle it in the calling function
  }
}
//Helper function to delete all documents from both overtime (audit+schedule) schemas
async function clearOvertimeAuditAndScheduleWinners() {
  await OvertimeAudit.deleteMany({})
  console.log(`Helper: All Documents cleared from the Overtime Audit Winners Schema`)
  await OvertimeSchedule.deleteMany({})
  console.log(`Helper: All Documents cleared from the Overtime Schedule Winners Schema`)
}
//Helper function to process OT data for schema (map to plain object)
function convertMapToPlainObject(overtimeCalcsMap) {
  const forSchema = {}

  for (const [day, dayData] of overtimeCalcsMap.entries()) {
    const { locIds, shifts } = dayData;

    forSchema[day] = {
      locIds,
      shifts: Object.fromEntries(
        Array.from(shifts.entries()).map(([shiftId, shiftData]) => [
          shiftId,
          {
            monitorId: shiftData.monitorId,
            monitorName: shiftData.monitorName,
            shiftName: shiftData.shiftName,
            locationId: shiftData.locationId._id || shiftData.locationId,
          },
        ])
      ),
    };
  }

  return forSchema
}


//Get current monitors, get locations, get regular shifts and get open shifts. 
module.exports = {
  // Rendering pages
  //
  //
  getHomePage: async (req, res) => {
    try {
      const { monitors, regularShifts, openShifts, locations } = await fetchCommonData()
      // const bids = await OvertimeBid.find()
      //                 .populate("rankings.position")
      //                 .lean
      // console.log(bids)
      // Render the home.ejs template and pass the data
      res.render("home.ejs", {
        user: req.user,
        monitors: monitors,
        regularShifts: regularShifts,
        openShifts: openShifts,
        locations: locations,
      });
    } catch (err) {
      console.log(err);
      res.redirect("/parking/home");
    }
  },
  //Render Edit page
  getEditPage: async (req, res) => {
    try {
      const { monitors, regularShifts, openShifts, locations } = await fetchCommonData()

      let formattedMon = monitors.map((monitor) => {
        return {
          ...monitor.toObject(), // Convert Mongoose document to plain object
          vaca: monitor.vaca.map(formatDate), // Format each vacation date
        }
      })
      
      // Render the edit.ejs template and pass the data
      res.render("edit.ejs", {
        user: req.user,
        monitors: monitors,
        regularShifts: regularShifts,
        openShifts: openShifts,
        locations: locations,
        formattedMon: formattedMon,
      });
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  //Overtime page
  getOvertimePage: async (req, res) => {
    try { 
      const { monitors, openShifts, locations, overtimeBid, overtimeAudit} = await fetchCommonData()
      // console.log(overtimeAudit)

      //Monitor being charged hours, hrs sorted by order ot shifts were assigned
      const auditTable = {}
      monitors.forEach(mon => { //loop over every monitor
        // overtimeWins.forEach(shift => { //loop over every OTshift
        overtimeAudit.forEach(shift => { //loop over every OTshift
          let name = mon.name, startingHrs = +mon.hours, endingHrs = startingHrs
          let hrs = shift.monitorsToCharge[name]
          if(!auditTable[name]){
            auditTable[name] = {
              hoursCharged: [],
              startEndHours: [startingHrs, endingHrs]
            }
          }

          if(hrs){
            auditTable[name].hoursCharged.push(hrs)
            auditTable[name].startEndHours[1] += hrs
          }else{
            auditTable[name].hoursCharged.push(0)
          }
        })
      })

      // Render the edit.ejs template and pass the data
      res.render("overtime.ejs", {
        monitors: monitors,
        openShifts: openShifts,
        locations: locations,
        overtimeBid: overtimeBid, //Show all monitor bids on ot shifts
        overtimeFlattened: overtimeAudit, //ot bids structured for easy display
        overtimeAudit: auditTable
      });
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  //Scheduling page
  getSchedulePage: async (req, res) => {
    try {
      const allocationResults = await allocateSchedule() //call schedule building function
      const [wkStart, _ ] = getNextThurs(THISWEEK), wkDays = []
      //Generate table headers for each day
      for(let i = 0; i < 7; i++){
        const date = new Date(wkStart)
        date.setDate(date.getDate() + i)
        wkDays.push(date.toLocaleDateString('en-US', { //Thursday May 1, 2025
          weekday:"long", 
          year:"numeric", 
          month:"long", 
          day:"numeric" }))
      }
      
      // Render the schedule.ejs template and pass the data
      res.render("schedule.ejs", {
        user: req.user,
        allocationResults: allocationResults, 
        daysArr: DAYSARRAY, 
        wkDays: wkDays,
      });
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },

  //Getting data from the Database.
  //
  //
  getMonitor: async (req, res) => {
    try {
      // Fetch monitor data from the database using the Parking model
      const monitor = await Monitor.findById(req.params.id).populate('regularShift location');
      //populate() fetches the actual data rather than just reference ids
      // i.e. "regularShift": "60f81fa38a887bf2f3080e5d", "location": "60f81fa38a887bf2f3080e5e" turns into real values

      if (!monitor) {
        console.error("Monitor not found");
        return res.redirect("/parking/home");
      }
      
      // Render the view and pass the monitor data
      res.render("home.ejs", { monitor: monitor, user: req.user });
      } catch (err) {
        console.error(err);
        res.redirect("/parking/home");
      }
    },
    getLocation: async (req, res) => {
      try {
        // Fetch location data from the database using the Parking model
        const location = await Location.findById(req.params.id)
        
        if (!location) {
          console.error("Location not found");
          return res.redirect("/parking/home");
        }
    
        // Render the view and pass the monitor data
        res.render("home.ejs", { location: location, user: req.user });
      } catch (err) {
        console.error(err);
        res.redirect("/parking/home");
      }
    },
    getRegularShift: async (req, res) => {
      try {
        // Fetch monitor data from the database using the Parking model
        const regularShift = await RegularShift.findById(req.params.id).populate('location');
        //populate() fetches the actual data rather than just reference ids
        // i.e. "regularShift": "60f81fa38a887bf2f3080e5d", "location": "60f81fa38a887bf2f3080e5e" turns into real values
  
        if (!monitor) {
          console.error("Monitor not found");
          return res.redirect("/parking/home");
        }
      
        // Render the view and pass the monitor data
        res.render("home.ejs", { regularShift: regularShift, user: req.user });
        } catch (err) {
          console.error(err);
          res.redirect("/parking/home");
        }
    },
    getOpenShift: async (req, res) => {
      try {
        // Fetch monitor data from the database using the Parking model
        const openShift = await OpenShift.findById(req.params.id).populate('location');
        // const openShift = await OpenShift.find({})
        //   //populate() fetches the actual data rather than just reference ids 
        //   .populate('location') //i.e. "regularShift": "60f81fa38a887bf2f3080e5d", "location": "60f81fa38a887bf2f3080e5e" turns into real values
        //   .sort( {date: 1}) // 1 ascending, -1 for descending
  
        if (!monitor) {
          console.error("Monitor not found");
          return res.redirect("/parking/home");
        }
      
        // Render the view and pass the monitor data
        res.render("home.ejs", { openShift: openShift, user: req.user });
        } catch (err) {
          console.error(err);
          res.redirect("/parking/home");
        }
    },

    //Add entries to the database
    //
    //
    addMonitor: async (req, res) => {
      try {
        await Monitor.create({
          id: req.body.id,
          name: req.body.displayName,
          regularShift: req.body.regularShift, // ObjectId of the shift
          location: req.body.shiftLocation, // ObjectId of the location
          // vaca: req.body.vacationStatus === "true", //Convert string to Boolean
          hours: req.body.hours,
          seniority: req.body.seniority,
        });
        console.log("Monitor has been added!");
        res.redirect("/parking/edit?tab=monitor-tab #monitors"); // Redirect to a relevant page
      } catch (err) {
        console.error(err);
        res.redirect("/parking/home");
      }
    },
    addLocation: async (req, res) => {
      try {
        console.log("Request body:", req.body); // Log the request body
        const { locationSelectionType, customDays } = req.body;
        let selectedDays = []
        switch(locationSelectionType) {
          case 'weekdays':
            selectedDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            break;
          case 'everyday':
            selectedDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            break;
          case 'custom':
            selectedDays = Array.isArray(customDays) ? customDays : [] // Array of checked values
            break; 
          case 'none':
            selectedDays = Array.isArray(customDays) ? customDays : [] // Array of checked values
            break; // 'none' falls through to empty array
        }

        await Location.create({
          name: req.body.locationName,
          scheduleType: selectedDays,
          // scheduleType: req.body.locationDay,
        });
        console.log("Location has been added!");
        res.redirect("/parking/edit?tab=location-tab#locations");
      } catch (err) {
        console.error(err);
        // console.log("Request body:", req.body);
        res.redirect("/parking/home");
      }
    },
    addRegularShift: async (req, res) => {
      try {
        const days = Array.isArray(req.body.days) ? req.body.days : [req.body.days]
        const startTime = new Date(`1970-01-01T${req.body.startTime}:00`);
        const endTime = new Date(`1970-01-01T${req.body.endTime}:00`);

        await RegularShift.create({
          name: req.body.regularShiftName,
          days: days, // array of days
          startTime: startTime,
          endTime: endTime,
        });
        console.log("Regular Shift has been added!");
        res.redirect("/parking/edit#tab=regularShift-tab#regularShifts");
      } catch (err) {
        console.error(err);
        res.redirect("/parking/home");
      }
    },
    addOpenShift: async (req, res) => {
      try {
        const shortDay = DAYMAPPING[req.body.day] //Shorten day
        // Convert start+end to Date objects
        const startTime = new Date(`1970-01-01T${req.body.startTime}:00`);
        const endTime = new Date(`1970-01-01T${req.body.endTime}:00`);
        const totalHours = calculateShiftHours(startTime, endTime);
        // Format times to AM/PM
        const formattedStartTime = startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        const formattedEndTime = endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        //Get location, remember to call .name on the object!
        const location = await Location.findById(req.body.shiftLocation);

        //Pad to normalize MM/DD format
        const padDateString = (dateStr) => {
          const [month, day] = dateStr.split('/');
          return `${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
        }
        const paddedDate = padDateString(req.body.date)

        await OpenShift.create({
          //[date][location][time][number of hours] e.g.  THU 5/1 52OX 11:00PM-7:00AM (8.0) 
          name: `${shortDay} ${req.body.date} ${location.name} ${formattedStartTime} - ${formattedEndTime} (${totalHours})`, 
          location: req.body.shiftLocation, // ObjectId of the location
          day: req.body.day,
          date: paddedDate, //req.body.date,
          startTime: startTime,
          endTime: endTime,
          totalHours: totalHours,
          recurring: !!req.body.openEveryWeek // Convert truthy/falsy value to Boolean
        });
        console.log("Open Shift has been added!");
        res.redirect("/parking/edit#tab=openShift-tab#openShifts");
      } catch (err) {
        console.error(err);
        res.redirect("/parking/home");
      }
    },
  //Add helper function to automatically add OT shift when vacation is added
  //Conversely add helper delete function when vacation is deleted
  addVacation: async (req, res) => {  
    try{
      const { vacationMonitorSelect, startDate, endDate} = req.body
      //console.log(req.body) //{vacationMonitorSelect: 'Monitor ID', startDate: '2025-05-01', endDate: '2025-05-01'
      
      //Parse local dates + split before declaring the date
      const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
      const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
      const start = new Date(startYear, startMonth - 1, startDay); // Months are 0-indexed
      const end = new Date(endYear, endMonth - 1, endDay);
      //Ensure start/endDate are valid
      if(isNaN(start) || isNaN(end) || start > end){
        return res.status(400).send("Invalid vacation date range provided.");
      }

      //Generate all dates in range
      const dateRange = []
      let currentDate = new Date(start)
      while (currentDate <= end){
        dateRange.push(new Date(currentDate))
        currentDate.setDate(currentDate.getDate() + 1)
      }

      //Find monitor and update vac array
      const monitor = await Monitor.findOneAndUpdate(
        { _id: vacationMonitorSelect}, 
        { $addToSet: { vaca: { $each: dateRange} } }, //ensures dupes are not added to vaca array
        { new: true} // return updated document
      )

      if(!monitor) return res.status(404).send("Monitor not found.")

      console.log("Vacation has been added!");
      res.redirect("/parking/edit#tab=vaca-tab#vacation")
      } catch(err){
        console.error(err);
        res.redirect("/parking/home");
    }
  },

  // Update info in the database
  // 
  // 
  updateMonitor: async (req, res) => {
    try {
      const monitor = await Monitor.findById(req.params.id).populate("regularShift location");
      const regularShifts = await RegularShift.find();
      const locations = await Location.find();
      // console.log("Request body:", req.body); // Debugging

      await Monitor.findByIdAndUpdate(req.params.id, {
        id: req.body.id,
        name: req.body.displayName,
        regularShift: req.body.regularShift, // ObjectId of the shift
        location: req.body.shiftLocation, // ObjectId of the location
        vaca: req.body.vacationStatus,
        hours: req.body.hours,
        seniority: req.body.seniority,
      });
      console.log("Monitor has been updated!");
      res.redirect("/parking/edit?tab=monitor-tab#displayMonitors") //displayMonitors");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  updateOpenShift: async (req, res) => {
    try {
      const openShift = await Location.find();
      if(!openShift){
        console.log("OpenShift not found")
        return res.redirect("/parking/home")
      }
      // console.log("Request body:", req.body)
      await OpenShift.findByIdAndUpdate(req.params.id, {
        location: req.body.shiftLocation, //update location field
        recurring: req.body.recurring === "true" //convert string to boolean
      });
      console.log("OpenShift has been updated!");
      res.redirect("/parking/edit?tab=openShift-tab-pane#displayOpenShifts") //displayOpenShifts"); 
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
/*
const test = {
  monitor: '6826563dd3f7526aff07d080',
  rankings: [
    { position: '6826495e9e8667f3047c5613', rank: 1 },
    { position: '68264a8179f269ffb0f939f8', rank: 2 },
    // Empty ranks should be excluded
  ]
}
test['monitor'] or test.monitor // "6826563dd3f7526aff07d080"
console.log(test.rankings[0].position) // "6826495e9e8667f3047c5613"
console.log(test.rankings[0]) //Object { position: "6826495e9e8667f3047c5613", rank: 1 }
*/
  updateOvertimeBid: async (req, res) => {
    try {
      //debugging
      // console.log("Request received:", req.body); // Debugging statement
      // console.log("Formatted Rankings:", rankingArr)
      // console.log(`Monitor: ${monId}, Hours: ${monitor.hours}, Senioritiy: ${monitor.seniority}`)
  
      //monitorId from form -> URL, rankings from form submission
      const monId = req.params.id, rankings = req.body.rankings, rankingArr = [] 
      //monitorId: '6826563dd3f7526aff07d080',
      //rankings: { '6826495e9e8667f3047c5613': '1', '68264a8179f269ffb0f939f8': '2', '68264ac779f269ffb0f93a04': '', }  
      
      //Find Monitor by ID
      const monitor = await Monitor.findById(monId)
      if(!monitor){
        console.log("Monitor not found")
        return res.redirect("/parking/home")
      }
      //Populate array of objects to pass to OvertimeBidsSchema later
      for(const id in rankings){
        if(rankings[id]){ //Filter rankings to remove empty values
          rankingArr.push({position: id, rank: rankings[id]})
        }
      }//TODO: Sort these in reverse order because pop() is O(1)

      //Update/Create OvertimeBid document
      await OvertimeBid.findOneAndUpdate(
        { monitor: monId },
        {
          $set: {
            rankings: rankingArr, //insert formatted rankings
            // monitorHours: monitor.hours,
            // monitorSeniority: monitor.seniority,
          },
        },
        { upsert: true } //Create new document if one doesn't exist
      )

      console.log("Overtime Bid has been updated!");
      res.redirect("/parking/overtime?tab=overtimeBid-tab#rankingForm");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  updateOvertimeWinnersRanked: async (req, res) => { 
    try {
      //   await Monitor.findByIdAndUpdate(req.params.id, {
      //     monitorName: ,
      //     shiftName:,
      //     hours: ,
      //     monitorsToCharge:,
      // })
      console.log("Ranked Overtime Winners have been updated!");
      res.redirect("/parking/overtime?tab=overtimeBid-tab#displayOvertime"); 
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  calculateOvertimeBid: async (req, res) => { //Press a button
    try {
      //Call overtime calculation function to get 
      const [overtimeWinsForSchedule, overtimeWinsForAudit] = await allocateOvertime() 
      
      //Error messages
      if(!OvertimeAudit) throw new Error("overtime audit unavaliable")
      if(!overtimeWinsForSchedule || !overtimeWinsForAudit){
        console.log("Error in retreiving overtime calculations.")
        return res.redirect("/parking/home")
      }

      //Convert map object to plain object for insertion
      const formattedData = convertMapToPlainObject(overtimeWinsForSchedule)

      //Clear both OT schemas before inserting as new documents
      await clearOvertimeAuditAndScheduleWinners()
      
      //Add overtimeWinsForAudit to Schema
      await OvertimeAudit.insertMany(overtimeWinsForAudit)
      //Add overtimeWinsForSchedule to Schema
      await OvertimeSchedule.create({ days: formattedData });

      console.log("Overtime Audit Winners have been added to the DB")
      console.log("Overtime Winners for Scheduling have been added to the DB")
      res.redirect("/parking/overtime?overtimeAssignment-tab#displayOvertimeWinners")
    } catch (err) {
      console.error(err)
      res.redirect("/parking/home")
    }
  },
  //Delete entries from DB
  //
  //
  deleteMonitor: async (req, res) => {
    try {
      const monitor = await Monitor.findById(req.params.id)
      if(!monitor){
        console.log("Monitor not found")
        return res.redirect("/parking/home")
      }
      await Monitor.findByIdAndDelete(req.params.id)
      console.log("Monitor has been deleted!");
      res.redirect("/parking/edit?tab=monitor-tab#displayMonitors"); 
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  deleteLocation: async (req, res) => {
    try {
      const location = await Location.findById(req.params.id)
      if(!location){
        console.log("Location not found")
        return res.redirect("/parking/home")
      }
      await Location.findByIdAndDelete(req.params.id)
      console.log("Location has been deleted!");
      res.redirect("/parking/edit?location-tab#displayLocations");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  deleteRegularShift: async (req, res) => {
    try {
      const regularShift = await RegularShift.findById(req.params.id)
      if(!regularShift){
        console.log("Regular Shift not found")
        return res.redirect("/parking/home")
      }
      await RegularShift.findByIdAndDelete(req.params.id)
      console.log("Regular Shift has been deleted!");
      res.redirect("/parking/edit?regularShift-tab#displayRegularShifts");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  deleteOpenShift: async (req, res) => {
    try {
      const openShift = await OpenShift.findById(req.params.id)
      if(!openShift){
        console.log("Open Shift not found")
        return res.redirect("/parking/home")
      }
      await OpenShift.findByIdAndDelete(req.params.id)
      console.log("Open Shift has been deleted!");
      res.redirect("/parking/edit?openShift-tab#displayOpenShifts");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  deleteVacation: async (req, res) => {
    try {
      const monitorId = req.params.id;
      // Update the monitor's vaca field to an empty array
      await Monitor.findByIdAndUpdate(monitorId, { vaca: [] });

      console.log(`Vacation cleared for monitor with ID: ${monitorId}`);
      res.redirect('/parking/edit?vacation-tab#displayVacation'); // Redirect back to the vacation management section
    } catch (err) {
      console.error(`Error clearing vacation for monitor: ${err}`);
      res.redirect('/parking/home'); // Redirect to home on error
    }
  },
  deleteOvertimeBid: async (req, res) =>{
    try{
      console.log("Request ID:", req.params.id);
      const bidId = req.params.id;
      if(!bidId){
        console.log("Monitor not found")
      }
      await OvertimeBid.findByIdAndUpdate(bidId, { $set: { rankings: [] } })
      console.log(`Rankings cleared for Overtime Bid with ID: ${bidId}`)
      res.redirect("/parking/overtime?tab=openShift-tab#displayOvertime")
    } catch(err){
      console.error(err);
      res.redirect('/parking/home'); // Redirect to home on error
    }
  },
  deleteOvertimeAuditWinners: async (req, res) =>{
    try{
      clearOvertimeAuditAndScheduleWinners()
      console.log(`Route deleteOvertimeAuditWinners successfully ran!`)
      res.redirect("/parking/overtime?tab=overtimeAssignment-tab#overtime#displayOvertimeWinners")
    } catch(err){
      console.error(err);
      res.redirect('/parking/home'); // Redirect to home on error
    }
  },

  // SERVICES
  //
  //
  // allocateOvertimePage: async (req, res) => {
  //   try {
  //     // Call the allocateOvertime function
  //     const results = await allocateOvertime();

  //     // Update all monitors' hours
  //     await Promise.all(
  //       Object.entries(results.summary).map(([id, hours]) =>
  //         Monitor.updateOne({ _id: id }, { $inc: { hours: hours } })
  //       )
  //     );

  //     // Render the allocation results page
  //     res.render('allocation-results', results);
  //   } catch (err) {
  //     console.error(err);
  //     res.redirect('/parking/home');
  //   }
  // },
  // allocateSchedule: async (req, res) => {
  //   try {
  //     // Call the allocateSchedule function
  //     const results = await allocateSchedule();

  //     // Render the allocation results page
  //     res.render('allocation-results', results);
  //   } catch (err) {
  //     console.error(err);
  //     res.redirect('/parking/home');
  //   }
  // },
};
