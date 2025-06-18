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
const { calculateShiftHours, formatDate, getNextThurs } = require('../utils/dateHelpers')
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


function resetLocationToday(locationsToday){
  // template to populate with monitors later [location Object, monitor name, overtime shift?]
  //[ '10EV', 'VACACHECK2' ] -> [ '10EV', 'Unassigned' ], also used to reset
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
        
        //Adding OT locations for today from the overtime calculation obj
        overtimeCalcs[dayName].locIds.forEach(ot => { //O(n^2)
          locationsCopy.forEach(l => { 
            if(l._id.toString() === ot.toString() && (!l.scheduleType.includes(dayName))){
              l.scheduleType.push(dayName) 
            }
          })
        })
        // if(i===0) console.log(locationsCopy )
        
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
        let locationMonitors = resetLocationToday(locationsToday)
        // console.log(locationMonitors)
        
        //filter regular/overtime shifts for this day
        const shiftsToday = regularShifts.filter(s => s.days.includes(dayName))
        //Add today's OT shifts = overtimeCalcs[dayName] 
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
        // if(i===0)console.log(shiftsToday)
        
        shiftsToday.forEach( (shift, idx) => { //Loop over all shifts
          //Reset locationMonitors for current shift
          locationMonitors = resetLocationToday(locationsToday)
          // if(i===0) console.log(shift)
          //   console.log("$$$$$$$$$$$")
          //Regular Shift: call monitorByShiftId() to get monitor info
          //Overtime Shift: grab monitor(s) from Shift object
          // const monitor = monitorByShiftId.get(shift._id.toString()) 
          const monitor = shift?.overtime === true ? [shift] : monitorByShiftId.get(shift._id.toString()) 
          // if(i===0) console.log(monitor)
            // console.log("*******************")
          
          if (!monitor) {
            // console.warn(`WARNING: ${DAYSARRAY[i]}: No monitors found for shift: ${shift.name.toString()}`)
            return // Skip this shift if no monitors are found
          }else{
            monitor.forEach(m => { //loop thru monitors and add to locationMonitors accordingly
              // Location in diff spot in Overtime vs. Regular Shift objects.
              const monLocId = m?.overtime === true ? m.location : m?.location._id
              // const monLocId = ""
              if(locationsToday[monLocId]){
                locationMonitors[locationsToday[monLocId].index][1] = 
                  locationMonitors[locationsToday[monLocId].index][1] === EMPTY
                  ? m.name // Replace "Unassigned"
                  : locationMonitors[locationsToday[monLocId].index][1] + `, ${m.name}` // Append with a comma
                //console.log(`${DAYSARRAY[i]} Shift ID: ${shift._id}, Monitor(s):`, m.name, m.id, m._id);
              }
            }) 
          }
          // if(i===0) console.log(locationsMonitors)

          rows[`shift_${idx}`] = {
              start: shift.startTime,
              end: shift.endTime,
              locationMonitors: locationMonitors, //JSON.parse(JSON.stringify(locationMonitors)), // [locationObject, monitorObject]
              shiftObject: shift,
              isOpenShift: shift?.overtime,
          }
          if(i===0)console.log(rows)
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