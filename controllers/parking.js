//Required for import/export from mongoDB
const fs = require("fs")
const path = require("path")
const multer = require("multer")
const upload = multer({ dest: "uploads/" })
const mongoose = require('mongoose')
// Importing the schemas from the DB in models/Parking.js
const { Monitor, Location, OpenShift, OvertimeAudit, OvertimeBid, OvertimeSchedule, RegularShift, VacationLookup, Holiday, SickTime, ShortNotice} = require("../models/Parking")
const { calculateShiftHours, findClosestHoliday, formatDate, formatTime, getFixedTimeRange, getNextThurs, getNextNextThurs, getPreviousDay, getNextThursDateObj, holidayNextWeek, qualifyingRegularShifts } = require('../utils/dateHelpers')
const { monitorLookupByMonitorIdTable, openShiftLookupByOpenShiftIdTable, regularShiftLookupByRegularShiftIdTable, locationLookupByLocationIdTable } = require('../utils/lookupHelpers')
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
const COLLECTIONS = { Monitor, RegularShift, OpenShift, Location, OvertimeBid, OvertimeSchedule, OvertimeAudit, VacationLookup, Holiday, SickTime, ShortNotice }


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
    const currentDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}` //date 
    console.log(currentDate)

    //If vacation day = day in monitor's regular shift
    if(shiftDays.includes(currentDay)){ 
      const data = {
        //[date][location][time][number of hours] e.g.  THU 5/1/25 52OX 11:00PM-7:00AM (8.0) 
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
//Helper: takes monitorId and deletes all vaca associated w/ that id
async function clearMonitorVacationShiftsAndOvertimeBids(monitorId) {
  const vacationDocs = await VacationLookup.find({ 'monitorAndOpenShift.monitorId': monitorId }).lean();

  // 1) Update the monitor's vaca field to an empty array
  await Monitor.findByIdAndUpdate(monitorId, { vaca: [] }) //works

  for (const doc of vacationDocs) {
    // 2) Delete from OpenShift collection
    await deleteOpenShift(doc.monitorAndOpenShift[0].openShiftId)
    
    //3) Delete entire document from Vacation Schema
    await VacationLookup.deleteOne( { _id: doc._id } )
  }

  console.log(`All vacation + overtime shifts cleared for monitor ID: ${monitorId}`)
}
//Helper function to delete all documents from both overtime (audit+schedule) schemas
async function clearOvertimeAuditAndScheduleWinners() {
  await OvertimeAudit.deleteMany({})
  console.log(`Helper: All Documents cleared from the Overtime Audit Winners Schema`)
  await OvertimeSchedule.deleteMany({})
  console.log(`Helper: All Documents cleared from the Overtime Schedule Winners Schema`)
}
//Helper: create audit table from overtimeAudit
async function createAuditTable(monitors, overtimeAudit){
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

  // Sort by starting hours (least to greatest)
  const sortedAudit = Object.entries(auditTable)
    .sort((a, b) => a[1].startEndHours[0] - b[1].startEndHours[0]) 
    .reduce((acc, [name, data]) => {
      acc[name] = data
      return acc
  }, {})

  return sortedAudit
}
//Helper function: Adds open shift to open shift Schema
async function createOpenShift(data) {
    const existingShift = await OpenShift.findOne({
    date: data.date,
    startTime: data.startTime,
    location: data.location
  });

  if (existingShift) { //if entry already in the schema
    return existingShift._id; 
  }

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
    const extraOT = await ShortNotice.find().populate("mon").lean()

    return { monitors, regularShifts, openShifts, locations, overtimeBid, overtimeAudit, vacaLookup, holidays, extraOT };
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
async function holidayOvertimeCreator(holidays){
  // const { holidays } = await fetchCommonData()
  //0)given this week's date start -> end => helper function returns true if there's vacation this week
  let currentHoliday = holidayNextWeek(getNextThursDateObj(THISWEEK), holidays)   
  // if(currentHoliday.length === 0) {
  //   console.log("No Holiday this week.")
  //   return //exit early if holiday is not found
  // }

  //Grabs empty holiday to populate - only should ever be length === 1
  const emptyOpenShiftHolidays = holidays
    .filter( holiday => holiday.openShiftArr.length === 0)
    .map(hol => `${hol.month}/${hol.day}/${hol.year.toString().slice(-2)}`)

  // console.log(holidays)

  //1) Grab regularShifts and create a lookup table
  const { regularShifts, monitors } = await fetchCommonData()
  const regularShiftLookupTable = regularShiftLookupByRegularShiftIdTable(regularShifts)

  //2)helper function returns array of regular shift IDs that qualify
  // const shiftIdsByDay = qualifyingRegularShifts(currentHoliday, monitors, DAYSARRAY)
  const shiftIdsByDay = qualifyingRegularShifts(emptyOpenShiftHolidays, monitors, DAYSARRAY)

  //3)loop over array regular shift IDs, defining data{} -> pass to createOpenShift()
  for(let day in shiftIdsByDay){
    for (const entry of shiftIdsByDay[day]) {
      //Format data for overtime Schema
      const shift = regularShiftLookupTable.get(entry.id.toString())
      const totalHours = calculateShiftHours(shift.startTime, shift.endTime)
      let [mm, dd, _] = (entry.date.split('/')).map(Number)
      const formattedStartTime = shift.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      const formattedEndTime = shift.endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      // console.log(new Date(entry.date))
      const data = {
        //[date][location][time][number of hours] e.g.  THU 5/1/25 52OX 11:00PM-7:00AM (8.0) 
        name: `${DAYMAPPING[entry.day]} ${entry.date} ${entry.location.name} ${formattedStartTime} - ${formattedEndTime} (${totalHours})`, 
        location: entry.location, // ObjectId of the location
        day: entry.day,
        date: new Date(entry.date), 
        startTime: shift.startTime,
        endTime: shift.endTime,
        totalHours: totalHours,
        recurring: false // Convert truthy/falsy value to Boolean
      }
      console.log(data.name)
      // if(data.day==='thursday') console.log(entry.date, date2, date3, parsedDate)
      const openShiftId = await createOpenShift(data); //Pass data to create new OT shift
      [mm,dd] = findClosestHoliday([mm, dd], shift);

      await Holiday.findOneAndUpdate(
        { month: mm, day: dd },
        { $addToSet: {openShiftArr: openShiftId}}, 
        { upsert: true, new: true}
      )
    }
  }
}
//Helper: takes monitor and generates random rankings for all eligible bids
async function rankingsBidGenerator(monitorObj, openShiftTable, rankings){
  const eligibleShifts = []
  const monStart = monitorObj.regularShift.startTime, monEnd = monitorObj.regularShift.endTime, monDay = monitorObj.regularShift.days
  //1)Discard any rankings that this monitor isn't eligible for
  for(const id in rankings){
    let shift = openShiftTable.get(id)
    let shiftStart = shift.startTime, shiftEnd = shift.endTime, shiftDay = shift.day
    // console.log("mon:", monStart, monEnd, monDay)
    // console.log("shift:", shiftStart, shiftEnd, shiftDay)
    if(monDay.includes(shiftDay)){ 
      const [mStart, mEnd] = getFixedTimeRange(monStart, monEnd)
      const [sStart, sEnd] = getFixedTimeRange(shiftStart, shiftEnd)
      const shiftConflict = (mStart < sEnd && sStart < mEnd) 
      // console.log("m:", mStart, mEnd, )
      // console.log("s:", sStart, sEnd, shiftConflict)
      if(shiftConflict) { continue }  //Conflict = Skip adding
    } 
    //Populate if monitor is eligible
    eligibleShifts.push( {
      position: id, rank: "", 
    }) 
  }

  //2) generate random arr of values from 1 -> ranking.length
  const len = eligibleShifts.length
  let randomizedRankings = Array.from({length: len}, (_, i) => i + 1)
  //Fischer-Yates shuffle algo
  for(let i = 0; i < len; i++){
    let randIdx = Math.floor(Math.random() * len)
    let temp = randomizedRankings[i]
    randomizedRankings[i] = randomizedRankings[randIdx]
    randomizedRankings[randIdx] = temp
  }

  //3) assign rankings based upon array
  for(const idx in eligibleShifts){
    eligibleShifts[idx].rank = randomizedRankings[idx]
  }

  //4) Sort and return
  return eligibleShifts.sort((a, b) => a.rank - b.rank)
}
async function monitorsOnVacationNextWeek(monitors){
  const [start, end] = getNextThursDateObj(THISWEEK)
  const nxtWkMonitorVaca = {}
  
  for(m of monitors){
    if(m.vaca.length!==0){
      const qualifyingDates = []

      m.vaca.forEach(day => {
        const d = new Date(day)
        if(d >= start && d <= end){
          const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
          qualifyingDates.push(mmdd)
        }
      })

      //found, push
      if (qualifyingDates.length > 0) { nxtWkMonitorVaca[m.name] = qualifyingDates }
    }
  }

  return nxtWkMonitorVaca
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
      // Render the home.ejs template and pass the data
      const [start, end] = getNextThursDateObj(THISWEEK)
      const nxtWkMonitorVaca = await monitorsOnVacationNextWeek(monitors)
      res.render("home.ejs", {
        user: req.user,
        monitors: monitors,
        regularShifts: regularShifts,
        openShifts: openShifts,
        locations: locations,
        monitorsOnVacaNextWeek: nxtWkMonitorVaca,
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
      const nxtWkMonitorVaca = await monitorsOnVacationNextWeek(monitors)

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
          _id: el?.monitorId._id,
          id: el?.monitorId.id,
          name: el?.monitorId.name,
          openShiftId: el?.openShiftId._id
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
        monitorsOnVacaNextWeek: nxtWkMonitorVaca,
      });
    } catch (err) {
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  //Overtime page
  getOvertimePage: async (req, res) => {
    try { 
      const { monitors, locations, overtimeBid, overtimeAudit, vacaLookup} = await fetchCommonData()

      //openShifts
      const [wkStart, wkEnd] = getNextThurs(THISWEEK)
      const startDateObj = new Date(wkStart), endDateObj = new Date(wkEnd)
      const openShifts = await OpenShift.find({ // Dates >= 5/1/25 // Dates <= 5/7/25
          date: { $gte: startDateObj, $lte: endDateObj } //grab shifts bound by start/end of next week
      }).populate("location").sort({ date: 1, startTime: 1})

      //Automatically generate overtime shifts if NEXTWEEK is holiday
      // if(holiday){regular shift => overtime shift}
      // await holidayOvertimeCreator()

      //Monitor being charged hours, hrs sorted by order ot shifts were assigned
      const auditTable = await createAuditTable(monitors, overtimeAudit)

      // console.log(auditTable)
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
          date: `${entry.month}/${entry.day}/${entry.year}`,
          _id: entry._id
        })
      }

      //Automatically generate overtime shifts if NEXTWEEK is holiday
      // if(holiday){regular shift => overtime shift}
      await holidayOvertimeCreator(holidays)

      // console.log(frontEndHolidayArr)
      res.render("holiday.ejs", {
        holidays: frontEndHolidayArr,
      })
    }catch(err){
      console.error(err)
      res.redirect("/parking/home")
    }
  },
  //Quickstart page
  getQuickstartPage: async(req, res) => {
    try{
      res.render("quickstart.ejs"),{}
    }catch(err){
      console.error(err)
      res.redirect("/parking/home")
    }
  },
  //Export Overtime page
  getExportOvertimePage: async(req, res) => {
    const { monitors, overtimeAudit } = await fetchCommonData()

    //grab shifts bound by start/end of next next week
    const [nextNextWeekStart,  nextNextWeekEnd] = getNextNextThurs(THISWEEK)
    const openShifts = await OpenShift.find({ // Dates >= 5/8/25 // Dates <= 5/14/25
        date: { $gte: nextNextWeekStart, $lte: nextNextWeekEnd } 
    }).populate("location").sort({ date: 1, startTime: 1})

    const auditTable = await createAuditTable(monitors, overtimeAudit)
    console.log(nextNextWeekStart,  nextNextWeekEnd, openShifts)

    try{
      res.render("exportovertime.ejs",{
        nextNextWeekOpenShifts: openShifts, //open shifts next next week
        overtimeFlattened: overtimeAudit, //ot bids structured for easy display
        overtimeAudit: auditTable, //audit table for charging monitors
      })
    }catch(err){
      console.error(err)
      res.redirect("/parking/home")
    }
  },
  //Extra OT/Short Notice page
  getExtraOTPage: async(req, res) => {
    try{
      const { monitors, extraOT } = await fetchCommonData()

      res.render("extraOT.ejs",{
        monitors: monitors,
        extraOT: extraOT,
      })
    }catch(err){
      console.error(err)
      res.redirect("/parking/home")
    }
  },
  //Finalize/Extra OT/Short Notice page
  getFinalizePage: async(req, res) => {
    try{
      res.render("finalize.ejs",{
      })
    }catch(err){
      console.error(err)
      res.redirect("/parking/home")
    }
  },
  //Mongo page
  getMongoPage: async(req, res) => {
    try{
      res.render("mongo.ejs",{
      })
    }catch(err){
      console.error(err)
      res.redirect("/parking/home")
    }
  },

  //EXPORT and IMPORT from Mongo
  //
  //
  exportMongoData: async (req, res) => {
    try {
      const exportData = {};
      for (const [name, Model] of Object.entries(COLLECTIONS)) {
        const docs = await Model.find().lean();
        exportData[name] = docs;
      }

      const jsonStr = JSON.stringify(exportData, null, 2);
      const filePath = path.join(__dirname, "../exports/mongo-backup.json");

      fs.writeFileSync(filePath, jsonStr);

      res.download(filePath, "mongo-backup.json");
    } catch (err) {
      console.error(err);
      res.status(500).send("Export failed");
    }
  },
  importMongoData: [
    upload.single("importFile"),
    async (req, res) => {
      try {
        const filePath = req.file.path;
        const rawData = fs.readFileSync(filePath, "utf-8");
        const jsonData = JSON.parse(rawData);

        for (const [name, data] of Object.entries(jsonData)) {
          const Model = COLLECTIONS[name];
          if (!Model || !Array.isArray(data)) continue;

          await Model.deleteMany({});
          await Model.insertMany(data);
        }

        fs.unlinkSync(filePath); // Clean up
        res.send("Import successful");
      } catch (err) {
        console.error(err);
        res.status(500).send("Import failed");
      }
    }
  ],
  

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
      // Convert start+end to Date objects
      const startTime = new Date(`${req.body.date}T${req.body.startTime}:00`);
      const endTime = new Date(`${req.body.date}T${req.body.endTime}:00`);
      // Handle overnight shifts
      if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }
      const totalHours = calculateShiftHours(startTime, endTime);

      // Format times to AM/PM
      const formattedStartTime = startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });
      const formattedEndTime = endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });
      const location = await Location.findById(req.body.shiftLocation) //Get location
      
      //Date
      // Native browser input is always YYYY-MM-DD e.g. "2025-05-01"
      const date = new Date(req.body.date)
      const parsedDate = new Date(`${req.body.date}T00:00:00`) //factors in DST
        .toLocaleString("en-US", { timeZone: "America/New_York"})
      const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][date.getDay() + 1]
      const shortDay = DAYMAPPING[day] //Shorten day
      const formattedDate = formatDate(parsedDate)
      console.log(parsedDate, day)

      const data = {
        //[date][location][time][number of hours] e.g.  THU 5/1 52OX 11:00PM-7:00AM (8.0) 
        name: `${shortDay} ${formattedDate} ${location.name} ${formattedStartTime} - ${formattedEndTime} (${totalHours})`, 
        location: req.body.shiftLocation, // ObjectId of the location
        day: day,
        date: parsedDate, 
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
    const { vacationMonitorSelect, startDate, endDate } = req.body
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
      let [year, month, day] = date.split('-')
      console.log(year, month, day)
      // console.log(name, month, day)

      await Holiday.create({
        name: name,
        month: month,
        day: day,
        year: year,
      })

      console.log("Holiday has been added!");
      res.redirect("/parking/holiday");
    }catch(err){
      console.error(err);
      res.redirect("/parking/home");
    }
  },
  addExtraOT: async(req, res) => {
    try{
      const { monId, hoursAdded, comment } = req.body
      const monitorObject = await Monitor.findById(monId)
      if(!monitorObject){
        console.error("Monitor not found")
      return res.redirect("/parking/home")
      }
      console.log(monId, hoursAdded, comment )
      console.log(monitorObject)

      // Try to find existing ShortNotice doc for this monitor
      let shortNotice = await ShortNotice.findOne({ mon: monId })

      if(!shortNotice){
      // Create new if not found
      shortNotice = await ShortNotice.create({
        mon: monId,
        extraShift: [{
          hours: parseFloat(hoursAdded),
          comment: comment || null
        }]
      })
      } else {
        // Push new entry into existing doc
        shortNotice.extraShift.push({
          hours: parseFloat(hoursAdded),
          comment: comment || null
        })
        await shortNotice.save();
      }

      // await ShortNotice.create({
      //   mon: monitorObject,
      //   hoursAdded: hours,
      //   comment: comment
      // })

      console.log("Extra OT has been added!");
      req.flash('success_msg', 'Extra OT entry successfully added.');
      res.redirect("/parking/extraOT");
    }catch(err){
      console.error(err);
      req.flash('error_msg', 'Something went wrong while adding the entry.');
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
      //monitorId from form -> URL, rankings from form submission
      const monId = req.params.id, rankings = req.body.rankings
      let rankingArr = [], finalRanking = []
      //check => [false, true], comparision logic filters to just true or just false
      const workingMoreThanOne = req.body.moreThanOneShift.length === 2 
      const anyShift = req.body.anyShift.length === 2 
      //monitorId: '6826563dd3f7526aff07d080',
      //rankings: { '6826495e9e8667f3047c5613': '1', '68264a8179f269ffb0f939f8': '2', '68264ac779f269ffb0f93a04': '', }  
      // console.log(workingMoreThanOne, anyShift)

      //Find Monitor by ID
      const monitor = await Monitor.findById(monId)
      if(!monitor){
        console.log("Monitor not found")
        return res.redirect("/parking/home")
      }

      //debugging
      // console.log("Request received:", req.body); // Debugging statement
      // console.log("Formatted Rankings:", rankingArr)
      // console.log(`Monitor: ${monId}, Hours: ${monitor.hours}, Senioritiy: ${monitor.seniority}`)

      //Grab vacation dates for this monitor 
      const vacation = monitorTable
        .get(monId)?.vaca
        .map(date => `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`)

      if(anyShift){//Monitor will work any shift
        finalRanking = await rankingsBidGenerator(monitorTable.get(monId.toString()), openShiftTable, rankings)
      }else{
        //Populate array of objects to pass to OvertimeBidsSchema later
        for(const id in rankings){
          if(rankings[id]){ //Filter rankings to remove empty values
            const date = openShiftTable.get(id).date
            // Do not allow a bid if the monitor is on vacation
            // Skip if monitor is on vacation for this date
            if(vacation && vacation.includes(date)){ continue }
              // actualRank++
              rankingArr.push({
                position: id, 
                rank: +rankings[id],
                originalPosition: Object.keys(rankings).indexOf(id),
              })
            }
        }//TODO: Sort these in reverse order because pop() is O(1)
        //Sort by rank, then by originalPosition
        const sortedArr = rankingArr.sort((a, b) => {
        if (a.rank === b.rank) {
              return a.originalPosition - b.originalPosition;
          }
          return a.rank - b.rank;
        })
        //Compile into object without 'originalPosition'
        for(const idx in sortedArr){
          let obj = sortedArr[idx]
          finalRanking[idx] = {position: obj.position, rank: +idx+1}
        }
      }

      // console.log(test)
      //Update/Create OvertimeBid document
      await OvertimeBid.findOneAndUpdate(
        { monitor: monId },
        { 
          $set: { 
            rankings: finalRanking, //insert formatted rankings
            workMoreThanOne: workingMoreThanOne, //monitor works 1+ shift
            workAnyShift: anyShift, //monitor will work ANY shift
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
  //IDK why this is empty / commented out.
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
      console.log(req.params.id)
      //delete vaca + associated openshifts, and overtime bids
      await clearMonitorVacationShiftsAndOvertimeBids(req.params.id) 
      await Monitor.findByIdAndDelete(req.params.id) //delete MONITOR
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
      // console.log(vacaId, monitorId, date, dayRaw, openShiftId)
      // console.log(monitorId, openShiftId)
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
      //const monitorId = req.params.id;
      // const matchingOpenShifts = await getOpenShiftsBy(monitorId) 
      // // console.log(monitorId, matchingOpenShifts)
      
      // // Update the monitor's vaca field to an empty array
      // await Monitor.findByIdAndUpdate(monitorId, { vaca: [] });

      // //Remove all objects in arr where monitorId matches, regardless of openShiftId
      // await VacationLookup.updateMany(
      //   {}, //Query all documents
      //   { $pull: { monitorAndOpenShift: { monitorId: monitorId } } } //$pull removes all documents w/ matching monitorId
      // );

      // // Delete all VacationLookup documents where monitorAndOpenShift is now empty
      // await VacationLookup.deleteMany({ monitorAndOpenShift: { $size: 0 } });

      // //Delete all openShifts associated with monitorId
      // for (const id of matchingOpenShifts) {
      //   await deleteOpenShift(id)
      // }

      // console.log(`All vacation cleared for monitor with ID: ${monitorId}`)
      // console.log(`All matching overtime shifts associated with monitor ID: ${monitorId} deleted`)
      await clearMonitorVacationShiftsAndOvertimeBids(req.params.id)
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
      const holidayToDelete = await Holiday.findById(req.params.id)
      if(!holidayToDelete){
        console.log("Holiday not found")
        return res.redirect("/parking/home")
      }
      //Delete linked openShift Ids
      for (const openShiftId of holidayToDelete.openShiftArr) {
      await OpenShift.findByIdAndDelete(openShiftId);
      }

      await Holiday.findByIdAndDelete(req.params.id)
      console.log("Holiday has been deleted!");
      res.redirect("/parking/holiday");
    }catch(err){
      console.error(err);
      res.redirect("/parking/home")
    }
  },
  deleteExtraOT: async (req, res) => {
    try{
      console.log("DELETE route hit:", req.method, req.params.id, req.query.index);
      const { id } = req.params //extract from URL
      const index = parseInt(req.query.index) //grab index of entry

      const doc = await ShortNotice.findById(id)
      // If document not found, or index is invalid, exit early and return to page
      if (!doc || !doc.extraShift || index < 0 || index >= doc.extraShift.length) {
        return res.redirect("/parking/home");
      }

      // Remove the specific entry from the entries array using splice
      doc.extraShift.splice(index, 1); // Remove that entry

      if (doc.extraShift.length === 0) {
        await ShortNotice.findByIdAndDelete(id); // Remove whole document if no entries left
      } else {
        await doc.save(); // Save the modified document
      }

      console.log("Extra OT has been deleted!");
      req.flash('success_msg', 'Extra OT entry successfully deleted.');
      res.redirect("/parking/extraOT");
    }catch(err){
      console.error(err);
      req.flash('error_msg', 'Something went wrong while deleting the entry.');
      res.redirect("/parking/home")
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
