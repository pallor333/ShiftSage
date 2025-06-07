// Importing the schemas from the DB in models/Parking.js
const { Monitor, RegularShift, OpenShift, Location, OvertimeBid} = require("../models/Parking");
const { findById } = require("../models/User");
const { allocateOvertime } = require('../services/overtimeServices'); //Import business logic from Service layer
const { allocateSchedule }= require('../services/scheduleServices'); //Import business logic from Service layer
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

    return { monitors, regularShifts, openShifts, locations, overtimeBid };
  } catch (err) {
    console.error("Error fetching common data:", err);
    throw err; // Rethrow the error to handle it in the calling function
  }
};
// Helper function to calculate hours in a shift
const calculateShiftHours = (startTime, endTime) => {
  let diffInMilliseconds = endTime - startTime; // Difference in milliseconds

  // Handle overnight shifts (endTime < startTime)
  if (diffInMilliseconds < 0) {
    diffInMilliseconds += 24 * 60 * 60 * 1000; // Add 24 hours in milliseconds
  }

  const diffInHours = diffInMilliseconds / (1000 * 60 * 60); // Convert to hours
  return diffInHours.toFixed(1); // Round to 1 decimal place
};
//Helper function to get next Thurs
function getNextThurs(date){
  const day = date.getDay() //0 = Sun, 6 = Sat
  const wkStart = new Date(date)

  //Calculate days till next Thurs
  const daysUntilThursday = day <= 4 ? 4 - day : 4 - day + 7;
  wkStart.setDate(date.getDate() + daysUntilThursday);
  const wkEnd = new Date(wkStart.getTime() + 604800000); // 7 days in ms
  // day = 0 (sun) (5/18); 4 - 0 = 4; 5/18 + 4 = 5/22 (thur)  
  // day = 5 (fri) (5/23); 4 - 5 + 7 = 6; 5/23 + 6 = 5/29 (thurs)

  return [`${wkStart.getMonth() + 1}/${wkStart.getDate()}/${wkStart.getFullYear()}`, 
          `${wkEnd.getMonth() + 1}/${wkEnd.getDate()}/${wkEnd.getFullYear()}`
          ] //Return string in format month/day/year
}
// Helper function to format dates in MM/DD/YY format
    const formatDate = (date) => {
      const d = new Date(date);
      return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
    };

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
      const { monitors, regularShifts, openShifts, locations, overtimeBid } = await fetchCommonData()
      // Render the edit.ejs template and pass the data
      res.render("overtime.ejs", {
        user: req.user,
        monitors: monitors,
        regularShifts: regularShifts,
        openShifts: openShifts,
        locations: locations,
        overtimeBid: overtimeBid,
      });
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  //Scheduling page
  //TODO: Add overtime shifts.locations to filteredShifts and filteredLocations 
  getSchedulePage: async (req, res) => {
    try {
      const allocationResults = await allocateSchedule() //call allocateSchedule function
      // const { monitors, openShifts, locations } = await fetchCommonData();
      // const regularShifts = await RegularShift.find().lean().sort( {startTime: 1})
      const [wkStart, wkEnd] = getNextThurs(THISWEEK), wkDays = []
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
      //wkDays[i].split(",")[0].toLowerCase() turns 'Thursday, May 1, 2025' into 'thursday'
      //Filter regularShifts into an array of days
      /*const filteredShiftsByDay = wkDays.map(day => 
        regularShifts.filter(shift => 
          shift.days && shift.days.some(d => d === day.split(",")[0].toLowerCase())
        )
      )
      //regularShifts
      //_id: new ObjectId('6811521626093510a53bf39f'),
      //name: 'Weekday First Shift B',
      //days: [ 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday' ],
      //startTime: 1970-01-01T13:00:00.000Z,
      //endTime: 1970-01-01T21:30:00.000Z,

      // filteredShiftsByDay.forEach((day, i) => 
      //   filteredShiftsByDay.push( 
      //       openShifts.filter(shift =>
      //       shift.day && shift.day.some(d => d === day.split(",")[0])
      //     ) 
      //   ) 
      // )
      // console.log(openShifts)

      // _id: new ObjectId('6826495e9e8667f3047c5613'),
      // name: 'THU 5/1 RECYCLE 07:00 AM - 03:30 PM (8.5)',
      // location: {
      //   _id: new ObjectId('682cf19bac6a6c7d4af034bf'),
      //   name: 'RECYCLE',
      //   scheduleType: 'none',
      //   __v: 0
      // },
      // day: 'Thursday',
      // date: '05/01',
      // startTime: 1970-01-01T12:00:00.000Z,
      // endTime: 1970-01-01T20:30:00.000Z,
      // totalHours: 8.5,
      // recurring: true,

      //location.scheduleType = [Weekday, Everyday, None]
      //Filter locations by day
      const filteredLocationsByDay = Array.from({ length: 7},(_,idx) => {
        const isWeekend = idx === 2 || idx === 3 //Sat (2) and Sun (3)
        return locations.filter(location =>  
          location.scheduleType === 'everyday' ? true 
          : location.scheduleType === 'none' ? false
          : !isWeekend
        )
      })*/

      //Debugging schedule
      // monitors.filter(m => {
      //   if(m.id === 101 || m.id === 106){
      //     let start = new Date(m.regularShift.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      //     let end = new Date(m.regularShift.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

      //     console.log(`${m.name} works at ${m.regularShift.name}(${start} - ${end}), ${m.location.name} on ${m.regularShift.days}`)
      //   }
      // })
      //WASHINGTON works at Weekday Third Shift A, SFPG/1WES on Monday,Tuesday,Wednesday,Thursday,Friday
      //VAN BUREN works at Weekend Third Shift, SFPG/1WES on Saturday,Sunday

      // console.log(allocationResults)
      // Render the schedule.ejs template and pass the data
      res.render("schedule.ejs", {
        user: req.user,
        // monitors: monitors,
        // filteredRegularShifts: filteredShiftsByDay,
        // openShifts: openShifts,
        // filteredLocations: filteredLocationsByDay.sort((a,b) => a - b),
        // wkStart: wkStart,
        // wkEnd: wkEnd,
        allocationResults: allocationResults, // pass allocation results
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
        res.redirect("/parking/edit#monitors"); // Redirect to a relevant page
      } catch (err) {
        console.error(err);
        res.redirect("/parking/home");
      }
    },
    addLocation: async (req, res) => {
      try {
        // console.log("Request body:", req.body); // Log the request body
        await Location.create({
          name: req.body.locationName,
          scheduleType: req.body.locationDay,
        });
        console.log("Location has been added!");
        res.redirect("/parking/edit#locations");
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
        res.redirect("/parking/edit#regularShifts");
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
        res.redirect("/parking/edit#openShifts");
      } catch (err) {
        console.error(err);
        res.redirect("/parking/home");
      }
    },
  addVacation: async (req, res) => {
    try{
      const { vacationMonitorSelect, startDate, endDate} = req.body
      // console.log(vacationMonitorSelect, startDate, endDate)
      // console.log(req.body)
      //Ensure start/endDate are valid
      const start = new Date(startDate)
      const end = new Date(endDate)
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
      res.redirect("/parking/edit#vacation");
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
      res.redirect("/parking/edit#displayMonitors");
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
      res.redirect("/parking/edit#displayOpenShifts");
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
      }

      //Update/Create OvertimeBid document
      await OvertimeBid.findOneAndUpdate(
        { monitor: monId },
        {
          $set: {
            rankings: rankingArr, //insert formatted rankings
            monitorHours: monitor.hours,
            monitorSeniority: monitor.seniority,
          },
        },
        { upsert: true } //Create new document if one doesn't exist
      )

      console.log("Overtime Bid has been updated!");
      res.redirect("/parking/overtime");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
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
      res.redirect("/parking/edit#displayMonitors"); 
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
      res.redirect("/parking/edit#displayLocations");
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
      res.redirect("/parking/edit#displayRegularShifts");
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
      res.redirect("/parking/edit#displayOpenShifts");
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
      res.redirect('/parking/edit#displayVacation'); // Redirect back to the vacation management section
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
    res.redirect("/parking/overtime#displayOvertime")
    } catch(err){
      console.error(err);
      res.redirect('/parking/home'); // Redirect to home on error
    }
  },
  // SERVICES
  //
  //
  allocateOvertimePage: async (req, res) => {
    try {
      // Call the allocateOvertime function
      const results = await allocateOvertime();

      // Update all monitors' hours
      await Promise.all(
        Object.entries(results.summary).map(([id, hours]) =>
          Monitor.updateOne({ _id: id }, { $inc: { hours: hours } })
        )
      );

      // Render the allocation results page
      res.render('allocation-results', results);
    } catch (err) {
      console.error(err);
      res.redirect('/parking/home');
    }
  },
  allocateSchedule: async (req, res) => {
    try {
      // Call the allocateSchedule function
      const results = await allocateSchedule();

      // Render the allocation results page
      res.render('allocation-results', results);
    } catch (err) {
      console.error(err);
      res.redirect('/parking/home');
    }
  },
};
