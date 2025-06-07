const { Template } = require("ejs");
const { Monitor, RegularShift, OpenShift, Location} = require("../models/Parking");
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
const THISWEEK = new Date("4/30/25") //new Date()
const DAYSARRAY = ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"]

//Helper function to get next Thurs
function getNextThurs(date){
  const day = date.getDay() //0 = Sun, 6 = Sat
  const wkStart = new Date(date)

  //Calculate days till next Thurs
  const daysUntilThursday = day <= 4 ? 4 - day : 4 - day + 7
  wkStart.setDate(date.getDate() + daysUntilThursday)
  const wkEnd = new Date(wkStart.getTime() + 604800000) // 7 days in ms
  // day = 0 (sun) (5/18); 4 - 0 = 4; 5/18 + 4 = 5/22 (thur)  
  // day = 5 (fri) (5/23); 4 - 5 + 7 = 6; 5/23 + 6 = 5/29 (thurs)

  return [`${wkStart.getMonth() + 1}/${wkStart.getDate()}/${wkStart.getFullYear()}`, 
          `${wkEnd.getMonth() + 1}/${wkEnd.getDate()}/${wkEnd.getFullYear()}`
          ] //Return string in format month/day/year
}

//Create a lookup table with O(1) lookup time via monitorByShiftId.get()
function monitorLookupTable(monitors){
  const monitorByShiftId = new Map()
  monitors.forEach(monitor => { // shift_id: {monitor object}
      const shiftId = monitor.regularShift._id.toString();
      if (!monitorByShiftId.has(shiftId)) {
          monitorByShiftId.set(shiftId, []); // shiftID is key
      }
      monitorByShiftId.get(shiftId).push(monitor); // Store multiple monitors inside arr
  })
  return monitorByShiftId
}
// Pre-index locations by _id for quick lookup
function locationLookupTable(locations){
  const locationById = new Map() // location_id: {location Object}
  locations.forEach(location => { 
      locationById.set(location._id.toString(), location);
  })
  return locationById
}

function buildWeeklyTable(date, monitors, regularShifts, openShifts, locations){
    const [wkStart, wkEnd] = getNextThurs(date), schedule = {}
    const monitorByShiftId = monitorLookupTable(monitors)
    const locationById = locationLookupTable(locations)  

    //Create 7 different obj, one for each day of the week
    for(let i = 0; i < 7; i++){
        const dayName = DAYSARRAY[i], isWeekend = i === 2 || i === 3; // Sat(2), Sun(3)
        schedule[dayName] = {}, rows = {}

        //filter locations for this day
        const locationsToday = locations
          .filter(l => isWeekend
                ? l.scheduleType === 'weekends' || l.scheduleType === 'everyday'
                : l.scheduleType === 'weekdays' || l.scheduleType === 'everyday'
          ).map( (loc, idx) => ({ //Add a counter to each entry
            ...loc._doc, //required to spread mongoose docs
            index: idx,
          }))
          .reduce((acc, loc) =>{
            acc[loc._id.toString()] = loc
            return acc
          }, {}) //use ID as the key

        //create a template to populate with monitors later [location Object, "Unassigned"]
        const locationMonitors = Object.entries(locationsToday).map(([_id, _]) => [_id, "Unassigned"])

        //filter regular/overtime shifts for this day
        const shiftsToday = regularShifts.filter(s => s.days.includes(dayName))
        const openShiftsToday = openShifts.filter(s => s.day.includes(dayName))
        
        // Create a Map to deduplicate by start/end time
        const shiftMap = new Map()
        // Add regular shifts first
        shiftsToday.forEach(shift => {
            const key = `${shift.startTime.getTime()}-${shift.endTime.getTime()}`;
            if (!shiftMap.has(key)) {
                shiftMap.set(key, { ...shift.toObject(), source: 'regular' })
            }
        })
        // Add open shifts (will overwrite regular shifts if same time)
        openShiftsToday.forEach(shift => {
            const key = `${shift.startTime.getTime()}-${shift.endTime.getTime()}`;
            shiftMap.set(key, { ...shift.toObject(), source: 'open' }); // Open shifts take precedence
        }); //add key for reg / open shift
        // Convert back to array
        const allShiftsToday = Array.from(shiftMap.values());

        shiftsToday.forEach( (shift, idx) => { //just regular shifts
        // allShiftsToday.forEach( (shift, idx) => {
          //grabs monitor(s) arr based upon SHIFT_ID
          const monitor = monitorByShiftId.get(shift._id.toString()) 
          if (!monitor) {
            console.warn(`No monitors found for shift ID: ${shift._id.toString()}`)
            return // Skip this shift if no monitors are found
          }else{
            monitor.forEach(m => { //loop thru monitors and add to locationMonitors accordingly
              const monLocId = m?.location._id //get locationID from monitor
              if(locationsToday[monLocId]){
                locationMonitors[locationsToday[monLocId].index][1] = m.name //m._id
              }
            })
          }
          console.log(locationMonitors)
          // Handle location differently for regular vs open shifts
          // let location = ('location' in shift && shift.location != null)
          //   ? locationById.get(String(shift.location))?.name || "Unknown" // OpenShift - has location reference
          //   : monitor?.location?.name || "Unassigned"; // Regularshift - find location via monitor

          rows[`shift_${idx}`] = {
              start: shift.startTime,
              end: shift.endTime,
              //monitor: monitor?.name || "Unassigned",
              location: locationMonitors, // [locationObject, monitorObject]
              shiftObject: shift,
              //monitorObject: monitor || null,
              //isOpenShift: !monitor,
          }
        })
        schedule[dayName] = {
          //place an array of location names in locations
          locations: locationMonitors.map(l => locationsToday[l[0]].name),
          row: rows,
          //Get exact date for day
          date: new Date(date.getTime() + (i * 24 * 60 * 60 * 1000)),
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
        let weeklyTable = buildWeeklyTable(THISWEEK, monitors, regularShifts, openShifts, locations)
        // console.log(weeklyTable)
        // console.log(monitors) //works
        // console.log("total monitors:", monitors.length) //14
        // console.log(locations) //10EV, 52OX, BWYG, HBS, etc...
        //scheduleType: 'weekdays', 'everyday', 'weekend'
        // console.log(wkStart, wkEnd) //5/1/2025, 5/8/2025
        // console.log(openShifts) //day, date, startTime, endTime, totalHours, recurring
        // console.log(regularShifts) //days, startTime, endTime [ 'monday', 'tuesday', 'wednesday', 'thursday', 'friday' ],
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
    [ '6830f7f02d893e2bd7aa5cd5', 'VACACHECK2' ],
    [ '682cf149ac6a6c7d4af03472', 'Unassigned' ],
    [ '682cf158ac6a6c7d4af03488', 'Unassigned' ],
    [ '682cf189ac6a6c7d4af0349e', 'COOLIDGE' ],
    [ '682cf194ac6a6c7d4af034b4', 'Unassigned' ],
    [ '682cfbb302f240408a8b0bf0', 'Unassigned' ],
    [ '682cf1afac6a6c7d4af034e0', 'Unassigned' ],
    [ '682cf1c3ac6a6c7d4af034f6', 'MADISON' ],
    [ '682cf1deac6a6c7d4af0350c', 'GARFIELD' ],
    [ '682cf1e5ac6a6c7d4af03517', 'Unassigned' ],
    [ '682cf1f5ac6a6c7d4af03543', 'WASHINGTON' ]
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