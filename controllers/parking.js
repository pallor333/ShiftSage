// Importing the schemas from the DB in models/Parking.js
const { Monitor, Location, OpenShift, OvertimeAudit, OvertimeBid, OvertimeSchedule, RegularShift, VacationLookup, Holiday} = require("../models/Parking")
const { calculateShiftHours, formatDate, formatTime, getNextThurs } = require('../utils/dateHelpers')
const { monitorLookupByMonitorIdTable, openShiftLookupByOpenShiftIdTable } = require('../utils/lookupHelpers')
const { allocateOvertime } = require('../services/overtimeServices') //Import business logic from Service layer
const { allocateSchedule } = require('../services/scheduleServices') //Import business logic from Service layer
const { getWorksheetColumnWidths } = require("json-as-xlsx")
//Can fetch related objects now
//const monitor = await Monitor.findById(monitorId).populate('regularShifts currentLocation');

//const [month, day, year] = [new Date().getMonth() + 1, new Date().getDate(), new Date().getFullYear()];
//console.log(`${month}/${day}/${year}`); // "5/22/2025"
//temp hardcoding date:
const THISWEEK = new Date("4/30/25") //new Date("6/29/25")
// const TESTWEEK = new Date() //Gets the current date from the user
// Map full day to a shortened format. 
const DAYMAPPING = { monday: "MON", tuesday: "TUE", wednesday: "WED", thursday: "THU", friday: "FRI", saturday: "SAT", sunday: "SUN",};
const DAYSARRAY = ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"]

/*********** HELPER FUNCTIONS */
//Helper function: Create overtime shifts based on monitor vacation
async function addOpenShiftFromVacation(monitorId, dateRange){
  const monitorAndOvertimeArray = [] //store date + monitorId + overtimeId
  //Create lookup table and get monitor from monitor id
  const { monitors } = await fetchCommonData()
  const monitorObj= monitorLookupByMonitorIdTable(monitors).get(monitorId)
  //Grab monitor's shift data
  const shiftDays = monitorObj.regularShift.days
  const monitorStartEnd = [monitorObj.regularShift.startTime, monitorObj.regularShift.endTime]
  const formattedStart = monitorStartEnd[0].toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  const formattedEnd = monitorStartEnd[1].toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  const totalHours = calculateShiftHours(monitorStartEnd[0], monitorStartEnd[1])
  const locationId = monitorObj.location._id, locationName = monitorObj.location.name

  //Loop over date arr
  for(const date of dateRange){
    //Shift 3 so Thursday(4) becomes 0. Modulo 7 wraps around (Sunday = 3)
    const currentDay = DAYSARRAY[(date.getDay() + 3) % 7]
    const currentDate = `${date.getMonth() + 1}/${date.getDate()}`

    //If vacation day = day in monitor's regular shift
    if(shiftDays.includes(currentDay)){ 
      const data = {
        //[date][location][time][number of hours] e.g.  THU 5/1 52OX 11:00PM-7:00AM (8.0) 
        name: `${DAYMAPPING[currentDay]} ${currentDate} ${locationName} ${formattedStart} - ${formattedEnd} (${totalHours})`, 
        location: locationId, // ObjectId of the location
        day: currentDay,
        date: currentDate, //req.body.date,
        startTime: monitorStartEnd[0],
        endTime: monitorStartEnd[1],
        totalHours: totalHours,
        recurring: false 
      }
      const openShiftId = await createOpenShift(data) //Add to open shift schema!
      monitorAndOvertimeArray.push([date, monitorId, openShiftId])
    }
  }

  return monitorAndOvertimeArray //[ [date, monitorId, openshift _id], [date, monitorId, openshift _id], etc] 
}
//Helper function to process OT data for schema (map to plain object)
function convertMapToPlainObject(overtimeCalcsMap) {
  const forSchema = {}

  for (const [day, dayData] of overtimeCalcsMap.entries()) {
    const { locIds, shifts } = dayData

    forSchema[day] = {
      locIds,
      shifts: Object.fromEntries(
        Array.from(shifts.entries()).map(([shiftId, shiftData]) => [
          shiftId,
          {
            monitorId: shiftData.monitorId  || null,
            monitorName: shiftData.monitorName,
            shiftName: shiftData.shiftName,
            locationId: shiftData.locationId._id || shiftData.locationId,
          },
        ])
      ),
    }
  }

  return forSchema
}
//Helper function to delete all documents from both overtime (audit+schedule) schemas
async function clearOvertimeAuditAndScheduleWinners() {
  await OvertimeAudit.deleteMany({})
  console.log(`Helper: All Documents cleared from the Overtime Audit Winners Schema`)
  await OvertimeSchedule.deleteMany({})
  console.log(`Helper: All Documents cleared from the Overtime Schedule Winners Schema`)
}
//Helper function: Adds open shift to open shift Schema
async function createOpenShift(data) {
  // Required bc monitor vacation = create open shift
  const newOpenShift = await OpenShift.create(data)
  return newOpenShift._id //Return for vacation schema
}
//Helper function: Deletes open shift from open shift Schema
async function deleteOpenShift(openShiftId){
  // Required bc delete monitor vaca = delete corresponding open shift
  // Mongoose automatically converts string IDs to ObjectId in queries, but not in findById methods
  return await OpenShift.findOneAndDelete({ _id: openShiftId })
}
// Helper function to fetch data from DB
const fetchCommonData = async () => {
  try {
    const monitors = await Monitor.find().populate("regularShift location").sort( {id: 1});
    const regularShifts = await RegularShift.find().sort({ name: 1 }) // 1 for ascending order
    const openShifts = await OpenShift.find().populate("location").sort({ date: 1, startTime: 1});
    const locations = await Location.find().sort({ name: 1});
    const overtimeBid = await OvertimeBid.find().populate("monitor").populate("rankings.position")
    const overtimeAudit = await OvertimeAudit.find()
    const vacaLookup = await VacationLookup.find().populate("monitorAndOpenShift.monitorId").populate("monitorAndOpenShift.openShiftId").sort({ day: 1 })
    const holidays = await Holiday.find()

    return { monitors, regularShifts, openShifts, locations, overtimeBid, overtimeAudit, vacaLookup, holidays };
  } catch (err) {
    console.error("Error fetching common data:", err);
    throw err; // Rethrow the error to handle it in the calling function
  }
}
//Helper function: Returns an array of openShiftIds given monitorId from Vacation Schema
async function getOpenShiftsBy(monitorId){
  // Find all entries containing monitorId
  const docs = await VacationLookup.find({ "monitorAndOpenShift.monitorId": monitorId})
  const openShiftIds = []

  // Extract all openShiftIds for this monitorId
  docs.forEach(doc => {
    doc.monitorAndOpenShift.forEach(pair => {
      if(pair.monitorId.toString() === monitorId){
        openShiftIds.push(pair.openShiftId.toString())
      }
    })
  })

  return openShiftIds
}
//Helper function: Creates overtime shifts of every shift on a holiday
async function holidayOvertimeCreator(){

  //1)given this week's date start -> end => helper function returns true if there's vacation this week
  const currentHoliday = await holidayNextWeek(getNextThurs(THISWEEK))
  if(currentHoliday === false) return //exit early if holiday is not found
  
  //2)helper function returns array of regular shift IDs that qualify
  const regularShiftIds = await qualifyingRegularShifts(currentHoliday)
  //TODO: Need to revise this: Location+Time. PLUS, aren't uni holidays ALWAYS weekdays?
  //If they're only weekdays then the logic changes.

  //3)loop over array regular shift IDs, defining data{} -> pass to createOpenShift()
  // regularShiftIds.forEach(shift => {
  //   const data = {
        //[date][location][time][number of hours] e.g.  THU 5/1 52OX 11:00PM-7:00AM (8.0) 
      //   name: `${shortDay} ${req.body.date} ${location.name} ${formattedStartTime} - ${formattedEndTime} (${totalHours})`, 
      //   location: req.body.shiftLocation, // ObjectId of the location
      //   day: req.body.day,
      //   date: paddedDate, //req.body.date,
      //   startTime: startTime,
      //   endTime: endTime,
      //   totalHours: totalHours,
      //   recurring: !!req.body.openEveryWeek // Convert truthy/falsy value to Boolean
      // }
  //   createOpenShift(data)
  // })

}
//Helper function: Given this week, return holiday if found or false
async function holidayNextWeek([wkStart, wkEnd]){
  const { holidays } = await fetchCommonData()
  const [wkStartMonth, wkStartDay, year] = wkStart.split('/')
  const wkEndDay = wkEnd.split('/')[1]

  for(let holiday of holidays){
    const day = holiday.day.toString()
    //holiday found = exit early
    if(holiday.month.toString() === wkStartMonth){
      if(wkStartDay <= day && day <= wkEndDay){
        return `${holiday.month}/${day}/${year}`
      }
    }
  }
  return false
}
//Helper function: Given holiday, return regular shift id array
async function qualifyingRegularShifts(currentHoliday){
  //Holiday starts 11pm the night before. 3rd shift day of holiday does not count.
  //E.G for July 4th: July 3rd 11pm shift, July 4th 7am shift, July 4th 2pm shift, NOT july 4 11pm 
  const{ regularShifts } = await fetchCommonData()
  const regularShiftArr = []
  const dayNumberized = (new Date(currentHoliday).getDay() + 3) % 7
  const holidayYesterday = DAYSARRAY[dayNumberized-1]
  const holidayOf = DAYSARRAY[dayNumberized]
  console.log(holidayOf, holidayYesterday)
  //Regular shift -> Open shift if any hours of the shift overlap
  regularShifts.forEach(shift=> {
    let shiftDay = shift.days, shiftStart = shift.startTime 
    // console.log(shiftDay)
    if(shiftDay.includes(holidayOf) || shiftDay.includes(holidayYesterday)){
      // console.log(shift.name, shiftDay, formatTime(shiftStart), formatTime(shift.endTime))
    }
  })

  return regularShiftArr
}

//Get current monitors, get locations, get regular shifts and get open shifts. 
module.exports = {
  // Rendering pages
  //
  //
  //Home page
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
      const { monitors, regularShifts, openShifts, locations, vacaLookup} = await fetchCommonData()

      let formattedMon = monitors.map((monitor) => {
        return {
          ...monitor.toObject(), // Convert Mongoose document to plain object
          vaca: monitor.vaca.map(formatDate), // Format each vacation date
        }
      })

      // Formatting dates into readable format, getting monitor name/id
      vacaByFormattedDate = vacaLookup.map(v => ({
        day: formatDate(v.day),
        vacaId: v._id,
        dayRaw: v.day.toISOString(), 
        monitors: v.monitorAndOpenShift.map(el => ({ //[{monitorId: obj}, {openshiftId: obj}]
          _id: el.monitorId._id,
          id: el.monitorId.id,
          name: el.monitorId.name,
          openShiftId: el.openShiftId._id
        })),
      }))
      
      // Render the edit.ejs template and pass the data
      res.render("edit.ejs", {
        user: req.user,
        monitors: monitors,
        regularShifts: regularShifts,
        openShifts: openShifts,
        locations: locations,
        formattedMon: formattedMon,
        vacaByDate: vacaByFormattedDate,
      });
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  //Overtime page
  getOvertimePage: async (req, res) => {
    try { 
      const { monitors, openShifts, locations, overtimeBid, overtimeAudit, vacaLookup} = await fetchCommonData()
      // console.log(overtimeAudit)

      //Automatically regular shift -> overtime shift if holiday
      await holidayOvertimeCreator()

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
      const [wkStart, wkEnd] = getNextThurs(THISWEEK), wkDays = []
      const { vacaLookup } = await fetchCommonData() //grab monitors on vacation 
      const vacaMonitorArr = Array(7).fill(""), [first, last] = [new Date(wkStart), new Date(wkEnd)]

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

      //Create a vacation lookup table for caption
      vacaLookup.forEach(({ day, monitorAndOpenShift }) => {
        const date = new Date(day)
        if (date >= first && date <= last) { //Ensure date is this week
          //Shift 3 so Thursday(4) becomes 0. Modulo 7 wraps around (Sunday = 3)
          const dayIndex = (date.getDay() + 3) % 7
          vacaMonitorArr[dayIndex] = monitorAndOpenShift
            .map(m => m.monitorId.name) //Create new arr of each name
            .join(', ') //join with commas
        }
      })
      // console.log(allocationResults.schedule.thursday) //shift_8: { start: undefined, end: undefined, locationMonitors: [Array] }
      // Render the schedule.ejs template and pass the data
      res.render("schedule.ejs", {
        user: req.user,
        allocationResults: allocationResults, 
        daysArr: DAYSARRAY, 
        wkDays: wkDays,
        vacaLookup: vacaMonitorArr,
      });
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  //Holiday page
  getHolidayPage: async(req, res) => {
    try{
      const { holidays } = await fetchCommonData()
      // console.log(holidays)
      //Create holiday arr to display in the frontend
      let frontEndHolidayArr = []
      for(let entry of holidays){
        frontEndHolidayArr.push({
          name: entry.name,
          date: `${entry.month}/${entry.day}`,
          _id: entry._id
        })
      }

      // console.log(frontEndHolidayArr)
      res.render("holiday.ejs", {
        holidays: frontEndHolidayArr,
      })
    }catch(err){
      console.error(err)
      res.redirect("/parking/home")
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
      res.redirect("/parking/edit?tab=regularShift-tab#regularShifts");
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
      const location = await Location.findById(req.body.shiftLocation) //Get location

      //Pad to normalize MM/DD format
      const padDateString = (dateStr) => {
        const [month, day] = dateStr.split('/');
        return `${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
      }
      const paddedDate = padDateString(req.body.date)

      //await OpenShift.create({
      const data = {
        //[date][location][time][number of hours] e.g.  THU 5/1 52OX 11:00PM-7:00AM (8.0) 
        name: `${shortDay} ${req.body.date} ${location.name} ${formattedStartTime} - ${formattedEndTime} (${totalHours})`, 
        location: req.body.shiftLocation, // ObjectId of the location
        day: req.body.day,
        date: paddedDate, //req.body.date,
        startTime: startTime,
        endTime: endTime,
        totalHours: totalHours,
        recurring: !!req.body.openEveryWeek // Convert truthy/falsy value to Boolean
      }

      await createOpenShift(data) //Helper function adds to schema
      console.log("Open Shift has been added!");
      res.redirect("/parking/edit?tab=openShift-tab#openShifts");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  addVacation: async (req, res) => {  
  try{
    const { vacationMonitorSelect, startDate, endDate} = req.body
    // console.log(req.body) //{vacationMonitorSelect: 'Monitor ID', startDate: '2025-05-01', endDate: '2025-05-01'

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

    //1) Update monitor schema -> add to vaca array
    const monitor = await Monitor.findOneAndUpdate(
      { _id: vacationMonitorSelect}, 
      { $addToSet: { vaca: { $each: dateRange} } }, //ensures dupes are not added to vaca array
      { new: true} // return updated document
    )
    if(!monitor) return res.status(404).send("Monitor not found.")
    
    //2) OpenShift Schema -> Put monitor's shifts up for bid + return overtime shift Id
    let openShiftIdArr = await addOpenShiftFromVacation(vacationMonitorSelect, dateRange)
    // console.log(openShiftIdArr) [date, monitorId, openShiftId]

    //3) Vacation Schema -> Loop over range, adding each date and ordered pair
    for (const entry of openShiftIdArr) {
      // Use upsert to create the document if it doesn't exist
      await VacationLookup.findOneAndUpdate(
        { day: entry[0]},
        // add monitor + openshiftId to array, no duplicates
        { $addToSet: { monitorAndOpenShift: { monitorId: entry[1], openShiftId: entry[2] } } },
        { upsert: true, new: true }
      );
    }   

    console.log("Vacation has been added!")
    console.log("Monitor's shifts have been put up for bid!")
    res.redirect("/parking/edit?tab=vaca-tab#vacation")
    } catch(err){
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  addHoliday: async(req, res) => {
    try{
      const { name, date } = req.body
      let [y, month, day] = date.split('-')
      // console.log(y, m, d)

      await Holiday.create({
        name: name,
        month: month,
        day: day,
      })

      console.log("Holiday has been added!");
      res.redirect("/parking/holiday");
    }catch(err){
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
      res.redirect("/parking/edit?tab=openShift-tab#displayOpenShifts") //displayOpenShifts"); 
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
      const { monitors, openShifts, vacaLookup } = await fetchCommonData()
      const openShiftTable = openShiftLookupByOpenShiftIdTable(openShifts)
      const monitorTable = monitorLookupByMonitorIdTable(monitors) 
      let actualRank = 0 //Tracks ranking of bid
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

      //Grab vacation dates for this monitor 
      const vacation = monitorTable
        .get(monId)?.vaca
        .map(date => `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`)

      //Populate array of objects to pass to OvertimeBidsSchema later
      for(const id in rankings){
        if(rankings[id]){ //Filter rankings to remove empty values
          const date = openShiftTable.get(id).date
          // console.log(vacation, date, vacation.includes(date))
          // Do not allow a bid if the monitor is on vacation
          // Skip if monitor is on vacation for this date
          if(vacation && vacation.includes(date)){ continue }
          actualRank++
          rankingArr.push({position: id, rank: actualRank})
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
  updateRegularShift: async (req, res) => {
    try {
      const regularShift = await RegularShift.findById(req.params.id)
      if(!regularShift ){
        console.log("Regular Shift not found")
        return res.redirect("/parking/home")
      }
      // console.log("Request body:", req.body)
      // console.log("Request body type:", req.body.type)

      await RegularShift.findByIdAndUpdate(req.params.id, {
        type: req.body.type, //firstShift, secondShift, thirdShift, none
      });

      console.log("OpenShift has been updated!");
      res.redirect("/parking/edit?tab=regularShift-tab#displayRegularShifts") 
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
      // console.log(formattedData.thursday)
      // Clear both OT schemas before inserting as new documents
      await clearOvertimeAuditAndScheduleWinners()
      
      //Add overtimeWinsForAudit to Schema
      await OvertimeAudit.insertMany(overtimeWinsForAudit)
      //Add overtimeWinsForSchedule to Schema
      await OvertimeSchedule.create({ days: formattedData })

      console.log("Overtime Audit Winners have been added to the DB")
      console.log("Overtime Winners for Scheduling have been added to the DB")
      res.redirect("/parking/overtime?tab=overtimeAssignment-tab#displayOvertimeWinners")
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
      res.redirect("/parking/edit?tab=location-tab#displayLocations");
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
      res.redirect("/parking/edit?tab=regularShift-tab#displayRegularShifts");
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
      // await OpenShift.findByIdAndDelete(req.params.id)
      await deleteOpenShift(req.params.id) //Call helper function to delete
      console.log("Open Shift has been deleted!");
      res.redirect("/parking/edit?tab=openShift-tab#displayOpenShifts");
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  deleteOneVacation: async (req, res) => {
    try {
      const { vacaId, monitorId, date, dayRaw, openShiftId} = req.body
      console.log(vacaId, monitorId, date, dayRaw, openShiftId)
      console.log(monitorId, openShiftId)
      // console.log(req.body)
      const dateObj = new Date(dayRaw) //Processing into a date for comparison

      // Remove this monitor from all vacation lookup days
      await Monitor.findOneAndUpdate(
        { _id: monitorId }, //find all documents where monitorId matches
        { $pull: { vaca: date } } //$pull deletes each matched instance (5/1/25)
      );

      // Delete monitor from vacationLookup's monitorAndOpenShift field
      const vacLookup = await VacationLookup.findOneAndUpdate(
        { day: dateObj }, //2025-06-23T04:00:00.000+00:00
        { $pull: { monitorAndOpenShift: { monitorId: monitorId, openShiftId: openShiftId} } }, 
        { new: true } //return updated document
      );

      // Delete corresponding overtime shift
      await deleteOpenShift(openShiftId)

      // If monitorAndOpenShift is now empty, delete the VacationLookup document
      if (vacLookup && vacLookup.monitorAndOpenShift.length === 0) {
        await VacationLookup.deleteOne({ _id: vacLookup._id });
        console.log("Deleted empty date!")
      }

      console.log(`Vacation cleared for date: ${date}`);
      console.log(`Overtime shift deleted`)
      res.redirect('/parking/edit?tab=vaca-tab#displayVacationByDate'); // Redirect back to the vacation management section
    } catch (err) {
      console.error(`Error clearing vacation for date: ${err}`);
      res.redirect('/parking/home'); // Redirect to home on error
    }
  },
  deleteAllVacation: async (req, res) => {
    try {
      const monitorId = req.params.id;
      const matchingOpenShifts = await getOpenShiftsBy(monitorId) 
      // console.log(monitorId, matchingOpenShifts)
      
      // Update the monitor's vaca field to an empty array
      await Monitor.findByIdAndUpdate(monitorId, { vaca: [] });

      //Remove all objects in arr where monitorId matches, regardless of openShiftId
      await VacationLookup.updateMany(
        {}, //Query all documents
        { $pull: { monitorAndOpenShift: { monitorId: monitorId } } } //$pull removes all documents w/ matching monitorId
      );

      // Delete all VacationLookup documents where monitorAndOpenShift is now empty
      await VacationLookup.deleteMany({ monitorAndOpenShift: { $size: 0 } });

      //Delete all openShifts associated with monitorId
      for (const id of matchingOpenShifts) {
        await deleteOpenShift(id)
      }

      console.log(`All vacation cleared for monitor with ID: ${monitorId}`)
      console.log(`All matching overtime shifts associated with monitor ID: ${monitorId} deleted`)
      res.redirect('/parking/edit?tab=vaca-tab#displayVacationByMonitor'); // Redirect back to the vacation management section
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
      // This deletes everything inside, leaving document intact
      // await OvertimeBid.findByIdAndUpdate(bidId, { $set: { rankings: [] } })
      await OvertimeBid.deleteOne({ _id: bidId }) //Delete entire document
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
  deleteHoliday: async (req, res) => {
    try{
      const holidayToDelete  = await Holiday.findById(req.params.id)
      if(!holidayToDelete){
        console.log("Holiday not found")
        return res.redirect("/parking/home")
      }

      await Holiday.findByIdAndDelete(req.params.id)
      console.log("Holiday has been deleted!");
      res.redirect("/parking/holiday");
    }catch(err){
      console.error(err);
      res.redirect("/parking/home")
    }
  }

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
