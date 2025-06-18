/*
/*
Prepare arrays:
0)Get current date, and figure out when is next Thursday. Pass this current date, along with other things.
0)Define week start (Next Thursday)= 0 = thurs, 1 = fri, 2 = sat, etc... 6 = weds
1) Filter Monitor shifts by day.
2) Filter Monitor locations by day.

// 7 days, each with an array of rows (first row: locations, others: shifts)
[
  [ // Thursday
    ["10EV", "52OX", "RECYCLE"], // First row: locations
    { "11:00am": { "10EV": "HARRISON", "52OX": "SMITH", "RECYCLE": null } },
    { "1:00pm": { "10EV": "JONES", "52OX": null, "RECYCLE": "LEE" } },
    // ...more shifts
  ],
  [ Friday ...  ],
  // ...6 more days
]
Create 2D (3D?) array, [tableSchedule], 7 tables one for each day. Create empty 7 element array and loop over locations / monitors once.
to populate. Each row is an object named after shift and location:monitor, each table is an array and it's all enclosed inside an array. 
- First line is locations (ordered Alphabetically)
- 2nd through N lines always starts with shift (ordered)
arr.push({ "11:00am": { "10EV": "HARRISON" } }); // Output: [ { '11:00am': { '10EV': 'HARRISON' } } ]


const schedule = {
  Thursday: [
    { time: "11:00am", "10EV": "HARRISON", "52OX": "SMITH", "RECYCLE": null },
    { time: "1:00pm", "10EV": "JONES", "52OX": null, "RECYCLE": "LEE" }
  ],
  Friday: [ ... ],
  // ... more days
};

1) Loop over locations (alphabetical), push to tableSchedule based upon (weekday, weekend, everyday). How best to associate 
weekday/weekend/everyday with numbers? weekday = 0/1, 4-6. weekend = 2/3. everyday = 0-7.
2) Loop over shift times (earliest first), 

//Adding to object/array
const schedule = {
  Friday: [
    { time: "10:00am", "10EV": "TAYLOR", "52OX": "WHITE", "RECYCLE": null }
  ]
};

// Add Thursday
schedule.Thursday = [
  { time: "11:00am", "10EV": "HARRISON", "52OX": "SMITH", "RECYCLE": null },
  { time: "1:00pm", "10EV": "JONES", "52OX": null, "RECYCLE": "LEE" }
];

// Add another time slot to Thursday
schedule.Thursday.push({
  time: "3:00pm",
  "10EV": "WILSON",
  "52OX": "BROWN",
  "RECYCLE": null
});

// Add a new property to all Thursday entries
schedule.Thursday.forEach(entry => {
  entry["20EV"] = "DEFAULT_INSTRUCTOR";
});

console.log(schedule.Thursday);
*/
const { Monitor, RegularShift, OpenShift, Location} = require("../models/Parking");
const { calculateShiftHours, formatDate, formatTime, getNextThurs, toMinutes} = require('../utils/dateHelpers')
const { locationLookupByLocationIdTable, monitorLookupByShiftIdTable, openShiftLookupByOpenShiftIdTable} = require('../utils/lookupHelpers')
const { allocateOvertime } = require('./overtimeServices') // './' imports from same directory

const THISWEEK = new Date("4/30/25") //new Date()
const DAYSARRAY = ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"]
const EMPTY = "Unassigned"

const scheduleMap = {
  weekdays: ["thursday", "friday", "monday", "tuesday", "wednesday"],
  weekends: ["saturday", "sunday"],
  everyday: ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"]
}

function buildLookupShifts(shifts, monitors){
  const timeSlotMap = {}

  //Group by time range
  for (const shift of shifts) {
    const key = `${shift.startTime}-${shift.endTime}`
    if (!timeSlotMap[key]) timeSlotMap[key] = []

    timeSlotMap[key].push([
      shift.location,
      shift.monitor,
      shift.overtime || false,
      shift.startTime, 
      shift.endTime,
      shift.locationId,
    ])
  }

  //Sort the time keys by actual time
  const sorted = Object.entries(timeSlotMap).sort(([keyA], [keyB]) => {
    const [startA] = keyA.split('-');
    const [startB] = keyB.split('-');
    return toMinutes(startA) - toMinutes(startB);
  })

  return sorted // returns an array of [timeKey, entries]
}

// const shifts = [ //INPUT
//   { startTime: "08:00", endTime: "10:00", monitor: "Alice", location: "A", overtime: false },
//   { startTime: "08:00", endTime: "10:00", monitor: "Bob", location: "B", overtime: true },
//   { startTime: "10:00", endTime: "12:00", monitor: "Charlie", location: "C", overtime: false }
// ]
// { //OUTPUT
//   "08:00-10:00": [
//     ["A", "Alice", false],
//     ["B", "Bob", true]
//   ],
//   "10:00-12:00": [
//     ["C", "Charlie", false]
//   ]
// }

//Loop over it like this:
// for (const [timeKey, entries] of Object.entries(shiftMap)) {
//   for (const [location, monitor, overtime] of entries) {
//     // Use these to render a row
//     console.log(timeKey, location, monitor, overtime);
//   }
// }
function normalizeShifts(shifts, monitorByShiftId, locationById) {
  const normalized = []

  for (const shift of shifts) {
    if (shift.overtime) { ///Open Shift
      normalized.push({
        startTime: shift.startTime,
        endTime: shift.endTime,
        monitor: shift.name,
        location: locationById.get(shift.location._id.toString())?.name,
        locationId: shift.location._id, 
        overtime: true
      })
    } else { //Regular Shift
      //lookup monitors assigned to this shift, empty arr will get skipped
      const assignedMonitors = monitorByShiftId.get(shift._id.toString()) || []

      for (const monitor of assignedMonitors) {
        normalized.push({
          startTime: shift.startTime,
          endTime: shift.endTime,
          monitor: monitor.name,
          location: locationById.get(monitor.location._id.toString())?.name,
          locationId: monitor.location._id, 
          overtime: false
        })
      }
    }
  }

  return normalized
}

function resetLocationToday(locationsToday){
  // template to populate with monitors later [location Object, monitor name, overtime shift?]
  // reset [ '10EV', 'VACACHECK2' ] -> [ '10EV', 'Unassigned' ]
  return Object.entries(locationsToday).map(([_, loc]) => [loc.name, EMPTY, false]) 
}

function buildWeeklyTable(date, monitors, regularShifts, openShifts, locations, overtimeCalcs){
    const [wkStart, wkEnd] = getNextThurs(date), schedule = {}
    const monitorByShiftId = monitorLookupByShiftIdTable(monitors)
    const locationById = locationLookupByLocationIdTable(locations)  
    const openShiftById = openShiftLookupByOpenShiftIdTable(openShifts)

    //Create 7 different obj, one for each day of the week
    for(let i = 0; i < 7; i++){
        const dayName = DAYSARRAY[i], isWeekend = i === 2 || i === 3; // Sat(2), Sun(3)
        schedule[dayName] = {}, rows = {}
        let locationsCopy = locations //copying so we dont mutate original
        
        //Adding OT locations from overtimeCalc obj: edit scheduleType property with day of the week
        overtimeCalcs[dayName].locIds.forEach(ot => { //O(n^2)
          locationsCopy.forEach(l => { 
            if(l._id.toString() === ot.toString() && (!l.scheduleType.includes(dayName))){
              l?.scheduleType.push(dayName) 
            }
          })
        })
        
        //Filter locations for this day
        const locationsToday = locationsCopy
          .filter(l => l.scheduleType.includes(dayName)
          ).map( (loc, idx) => ({ //Add a counter to each entry
            ...(loc._doc || loc), // spread mongoose document or spread manual object
            index: idx,
          })).reduce((acc, loc) =>{
                if (!loc._id) {
                console.error("Invalid object in array:", loc);
                throw new Error("Object missing _id property");
            }
            acc[loc._id.toString()] = loc
            return acc
          }, {}) //use ID as the key
        //Create a sorted array of location / monitors for insertion later
        let locationMonitors = resetLocationToday(locationsToday)
        // console.log(locationMonitors)
        
        //Filter regular shifts
        const shiftsToday = regularShifts.filter(s => s.days.includes(dayName))
        //Add OT shifts (overtimeCalcs[dayName]) to shiftsToday 
        for(let shift in overtimeCalcs[dayName]){
          if(shift!=="locIds"){
            shiftsToday.push({
                  _id: shift, //instead of object, is just the openShiftId str
                  name: overtimeCalcs[dayName][shift].monitorName, //get whole obj -> monitor name
                  location: overtimeCalcs[dayName][shift].locationId._id, //locationId
                  overtime: true,
                  startTime: openShiftById.get(shift).startTime, //use lookup table
                  endTime: openShiftById.get(shift).endTime, 
            })
          }
        }
        //Normalize regular/ot shift into one single format
        const normalizedShiftsToday = normalizeShifts(shiftsToday, monitorByShiftId, locationById)
        //Coalesce same shifts + sort: [location, monitorName, overtime, start, end, locationID]
        const monitorShiftsArr = buildLookupShifts(normalizedShiftsToday)
        // if(i===0)console.log(monitorShiftsArr[2]) 

        //Loop over shifts and populate table
        //shiftsToday.forEach( (shift, idx) => { //Loop over all shifts
        monitorShiftsArr.forEach( (shift, idx) => {
          //Reset locationMonitors for current shift
          locationMonitors = resetLocationToday(locationsToday)
          // const [ location, monitorName, overtime, start, end, locationId ] = shift 
          // if(i===0)console.log(location, monitorName, overtime, start, end, locationId)
          // if(i===0)console.log(shift)
          // if(i===0)console.log("*************")
            //WHAT ARE THE UNDEFINEDS?
          // console.log(location, monitorName, overtime, start, end, locationID)
         
          
          // if (!monitor) {
          //   // console.warn(`WARNING: ${DAYSARRAY[i]}: No monitors found for shift: ${shift.name.toString()}`)
          //   return // Skip this shift if no monitors are found
          // }else{
          //   monitor.forEach(m => { //loop thru monitors and add to locationMonitors accordingly
          //     // Location in diff spot in Overtime vs. Regular Shift objects.
          //     const monLocId = m?.overtime === true ? m.location : m?.location._id
          //     // const monLocId = ""
          //     if(locationsToday[monLocId]){
          //       locationMonitors[locationsToday[monLocId].index][1] = 
          //         locationMonitors[locationsToday[monLocId].index][1] === EMPTY
          //         ? m.name // Replace "Unassigned"
          //         : locationMonitors[locationsToday[monLocId].index][1] + `, ${m.name}` // Append with a comma
          //       //console.log(`${DAYSARRAY[i]} Shift ID: ${shift._id}, Monitor(s):`, m.name, m.id, m._id);
          //     }
          //   }) 
          // }

          

          //location, monitorName, overtime, start, end, locationID
            shift.forEach(([location, monitorName, overtime, start, end, locationId]) => {
              console.log({ location, monitorName, overtime, start, end, locationId })
              console.log("$%$$$")

              rows[`shift_${idx}`] = {
                start: start,
                end: end,
                locationMonitors: locationMonitors,
                isOpenShift: overtime,
              }
            })  ////////THIS IS BUGGED FIX LATER

          // if(!monitorName){
          //   return //SKIP
          // }else{
          //   locationMonitors[locationsToday[locationId].index][1] = 
          //     locationMonitors[locationsToday[locationId].index][1] === EMPTY
          //     ? monitorName // Replace "Unassigned"
          //     : locationMonitors[locationsToday[locationId].index][1] + `, ${monitorName}` // Append with a comma
          // // console.log(`${DAYSARRAY[i]} Shift ID: ${shift._id}, Monitor(s):`, shift.name, m.id, m._id);
          // }


          
        })
        schedule[dayName] = {
          locations: locationMonitors.map(l => l[0]), //extract location names
          row: rows,
          date: new Date(date.getTime() + (i * 24 * 60 * 60 * 1000)), //Get exact date for day
          isWeekend, 
        }
    }
    return{
      weekStart: wkStart, 
      weekEnd: wkEnd, 
      schedule
    }
}

module.exports = {
    allocateSchedule: async() => {
      try{
        const monitors = await Monitor.find().populate("regularShift location").sort( {id: 1})
        const regularShifts = await RegularShift.find().sort({ name: 1 }) // 1 for ascending order
        const openShifts = await OpenShift.find().populate("location").sort({ date: 1, startTime: 1})
        const locations = await Location.find().sort({ name: 1})    
        const overtimeCalcs = await allocateOvertime()
        // console.log(overtimeCalcs.thursday)
        let weeklyTable = buildWeeklyTable(THISWEEK, monitors, regularShifts, openShifts, locations, overtimeCalcs)

        // console.log(weeklyTable.schedule.thursday.row.shift_1)
        // function easyDate(start, end){
        //   let s = new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        //   let e = new Date(end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        //   return `${s} - ${e}`
        // }
        // let tab = weeklyTable.schedule.thursday.row
        // console.log("thursday1", easyDate(tab.shift_1.start, tab.shift_1.end), tab.shift_1.location)
        // console.log("thursday2", easyDate(tab.shift_2.start, tab.shift_2.end), tab.shift_2.location)
        // console.log("thursday3", easyDate(tab.shift_3.start, tab.shift_3.end), tab.shift_3.location)

        console.log("allocateSchedule function called")
        return weeklyTable 
        }catch (err){
            console.error("Error, in allocateSchedule:", err)
            throw err
        }
    }
}

/*
schedule = {
  weekStart: '5/1/2025',
  weekEnd: '5/8/2025',
  schedule: {
    thursday: {
      locations: [Array],
      row: [Object],
      date: 2025-04-30T04:00:00.000Z,
      isWeekend: false
    },
    friday: {
      locations: [Array],
      row: [Object],
      date: 2025-05-01T04:00:00.000Z,
      isWeekend: false
    },
    saturday: {
      locations: [Array],
      row: [Object],
      date: 2025-05-02T04:00:00.000Z,
      isWeekend: true
    },
    sunday: {
      locations: [Array],
      row: [Object],
      date: 2025-05-03T04:00:00.000Z,
      isWeekend: true
    },
    monday: {
      locations: [Array],
      row: [Object],
      date: 2025-05-04T04:00:00.000Z,
      isWeekend: false
    },
    tuesday: {
      locations: [Array],
      row: [Object],
      date: 2025-05-05T04:00:00.000Z,
      isWeekend: false
    },
    wednesday: {
      locations: [Array],
      row: [Object],
      date: 2025-05-06T04:00:00.000Z,
      isWeekend: false
    }
  }
}

One day of schedule = {
  thursday: {
    locations: [
      '10EV',       '52OX',
      'BWYG',       'HBS',
      'NORTH',      'RIVER ROVER',
      'RIVER/MAKL', 'ROVING',
      'SFPG BOOTH', 'SFPG ROVER',
      'SFPG/1WES'
    ],
    row: {
      shift_1: [Object],
      shift_2: [Object],
      shift_3: [Object],
      shift_4: [Object],
      shift_5: [Object],
      shift_6: [Object],
      shift_7: [Object]
    },
    date: 2025-04-30T04:00:00.000Z,
    isWeekend: false
  },
  friday: {
    locations: [
      '10EV',       '52OX',
      'BWYG',       'HBS',
      'NORTH',      'RIVER ROVER',
      'RIVER/MAKL', 'ROVING',
      'SFPG BOOTH', 'SFPG ROVER',
      'SFPG/1WES'
    ],
    row: {
      shift_1: [Object],
      shift_2: [Object],
      shift_3: [Object],
      shift_4: [Object],
      shift_5: [Object],
      shift_6: [Object],
      shift_7: [Object]
    },
    date: 2025-05-01T04:00:00.000Z,
    isWeekend: false
  },
  saturday: {
    locations: [ '52OX', 'BWYG', 'HBS', 'NORTH', 'ROVING', 'SFPG/1WES' ],
    row: { shift_0: [Object], shift_1: [Object], shift_2: [Object] },
    date: 2025-05-02T04:00:00.000Z,
    isWeekend: true
  },
  sunday: {
    locations: [ '52OX', 'BWYG', 'HBS', 'NORTH', 'ROVING', 'SFPG/1WES' ],
    row: { shift_0: [Object], shift_1: [Object], shift_2: [Object] },
    date: 2025-05-03T04:00:00.000Z,
    isWeekend: true
  },
  monday: {
    locations: [
      '10EV',       '52OX',
      'BWYG',       'HBS',
      'NORTH',      'RIVER ROVER',
      'RIVER/MAKL', 'ROVING',
      'SFPG BOOTH', 'SFPG ROVER',
      'SFPG/1WES'
    ],
    row: {
      shift_1: [Object],
      shift_2: [Object],
      shift_3: [Object],
      shift_4: [Object],
      shift_5: [Object],
      shift_6: [Object],
      shift_7: [Object]
    },
    date: 2025-05-04T04:00:00.000Z,
    isWeekend: false
  },
  tuesday: {
    locations: [
      '10EV',       '52OX',
      'BWYG',       'HBS',
      'NORTH',      'RIVER ROVER',
      'RIVER/MAKL', 'ROVING',
      'SFPG BOOTH', 'SFPG ROVER',
      'SFPG/1WES'
    ],
    row: {
      shift_1: [Object],
      shift_2: [Object],
      shift_3: [Object],
      shift_4: [Object],
      shift_5: [Object],
      shift_6: [Object],
      shift_7: [Object]
    },
    date: 2025-05-05T04:00:00.000Z,
    isWeekend: false
  },
  wednesday: {
    locations: [
      '10EV',       '52OX',
      'BWYG',       'HBS',
      'NORTH',      'RIVER ROVER',
      'RIVER/MAKL', 'ROVING',
      'SFPG BOOTH', 'SFPG ROVER',
      'SFPG/1WES'
    ],
    row: {
      shift_1: [Object],
      shift_2: [Object],
      shift_3: [Object],
      shift_4: [Object],
      shift_5: [Object],
      shift_6: [Object],
      shift_7: [Object]
    },
    date: 2025-05-06T04:00:00.000Z,
    isWeekend: false
  }
}


schedule.thursday = {
  locations: [
    '10EV',       '52OX',
    'BWYG',       'HBS',
    'NORTH',      'RIVER ROVER',
    'RIVER/MAKL', 'ROVING',
    'SFPG BOOTH', 'SFPG ROVER',
    'SFPG/1WES'
  ],
  row: {
    shift_1: {
      start: 1970-01-01T10:30:00.000Z,
      end: 1970-01-01T19:00:00.000Z,
      location: [Array],
      shiftObject: [Object]
    },
    shift_2: {
      start: 1970-01-01T10:30:00.000Z,
      end: 1970-01-01T14:00:00.000Z,
      location: [Array],
      shiftObject: [Object]
    },
    shift_3: {
      start: 1970-01-01T12:00:00.000Z,
      end: 1970-01-01T20:30:00.000Z,
      location: [Array],
      shiftObject: [Object]
    },
    shift_4: {
      start: 1970-01-01T13:00:00.000Z,
      end: 1970-01-01T21:30:00.000Z,
      location: [Array],
      shiftObject: [Object]
    },
    shift_5: {
      start: 1970-01-01T20:00:00.000Z,
      end: 1970-01-02T04:30:00.000Z,
      location: [Array],
      shiftObject: [Object]
    },
    shift_6: {
      start: 1970-01-01T20:30:00.000Z,
      end: 1970-01-01T05:00:00.000Z,
      location: [Array],
      shiftObject: [Object]
    },
    shift_7: {
      start: 1970-01-02T04:00:00.000Z,
      end: 1970-01-01T12:30:00.000Z,
      location: [Array],
      shiftObject: [Object]
    }
  },
  date: 2025-04-30T04:00:00.000Z,
  isWeekend: false
}

schedule.thursday.row.shift_1 = 
{
  start: 1970-01-01T10:30:00.000Z,
  end: 1970-01-01T19:00:00.000Z,
  monitor: 'Unassigned',
  location: [
    [ '10EV', 'VACACHECK2' ],
    [ '52OX', 'Unassigned' ],
    [ 'BWYG', 'Unassigned' ],
    [ 'HBS', 'COOLIDGE' ],
    [ 'NORTH', 'Unassigned' ],
    [ 'RIVER ROVER', 'Unassigned' ],
    [ 'RIVER/MAKL', 'Unassigned' ],
    [ 'ROVING', 'MADISON' ],
    [ 'SFPG BOOTH', 'GARFIELD' ],
    [ 'SFPG ROVER', 'Unassigned' ],
    [ 'SFPG/1WES', 'WASHINGTON' ]
  ],
  shiftObject: {
    _id: new ObjectId('681152e926093510a53bf3c0'),
    name: 'Weekday Early First Shift B',
    days: [ 'monday', 'tuesday', 'wednesday', 'thursday', 'friday' ],
    startTime: 1970-01-01T10:30:00.000Z,
    endTime: 1970-01-01T19:00:00.000Z,
    __v: 1
  },
  monitorObject: [
    {
      _id: new ObjectId('6830ecf8e64b5c4e4d74bf46'),
      id: 108,
      name: 'HARRISON',
      regularShift: [Object],
      location: [Object],
      vaca: [],
      hours: new Decimal128('215'),
      seniority: 2018-08-24T00:00:00.000Z,
      lastUpdated: 2025-05-23T21:47:36.946Z,
      __v: 0
    }
  ],
  isOpenShift: false
}
*/

        // Create a Map to deduplicate by start/end time
        // const shiftMap = new Map()
        // // Add regular shifts first
        // shiftsToday.forEach(shift => {
        //     const key = `${shift.startTime.getTime()}-${shift.endTime.getTime()}`;
        //     if (!shiftMap.has(key)) {
        //         shiftMap.set(key, { ...shift.toObject(), source: 'regular' })
        //     }
        // })
        // // Add open shifts (will overwrite regular shifts if same time)
        // openShiftsToday.forEach(shift => {
        //     const key = `${shift.startTime.getTime()}-${shift.endTime.getTime()}`;
        //     shiftMap.set(key, { ...shift.toObject(), source: 'open' }); // Open shifts take precedence
        // }); //add key for reg / open shift
        // // Convert back to array
        // const allShiftsToday = Array.from(shiftMap.values());

                //}) //End looping over shiftsToday
          // console.log(locationMonitors)
          // Handle location differently for regular vs open shifts
          // let location = ('location' in shift && shift.location != null)
          //   ? locationById.get(String(shift.location))?.name || "Unknown" // OpenShift - has location reference
          //   : monitor?.location?.name || "Unassigned"; // Regularshift - find location via monitor