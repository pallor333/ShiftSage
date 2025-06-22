const { Monitor, RegularShift, OpenShift, Location} = require("../models/Parking");
const { formatTime, getFixedTimeRange, getNextThurs, toMinutes} = require('../utils/dateHelpers')
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

function coaleseAndSort(shifts){
  const timeSlotMap = {}

  //Group by time range
  for (const shift of shifts) {
    const key = getFixedTimeRange(shift.startTime, shift.endTime).join('*')
    //`${shift.startTime}*${shift.endTime}`//`${formatTime(shift.startTime)}-${formatTime(shift.endTime)}`

    if (!timeSlotMap[key]) timeSlotMap[key] = []
    timeSlotMap[key].push([
      shift.monitor,
      shift.overtime || false,
      shift.startTime, 
      shift.endTime,
      shift.locationId,
    ])
  }

  let sorted = Object.entries(timeSlotMap).sort((a, b) => {
    //First value in arr is time, split it into an arr to compare
    a = a[0].split('*')
    b = b[0].split('*')
    //Compare start times first, compare end time if startA===startB
    return a[0] - b[0] || a[1] - b[1]
  })

  //Remove key becos it gets in the way
  const removeKey = sorted.map( n => n[1] ) 

  // returns arr of [ [[entry1], [entry2], [etc]], [[entry1], [entry2], [etc]], [[andSoOnAndSoForth]] ]
  return removeKey 
}

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
        const monitorShiftsArr = coaleseAndSort(normalizedShiftsToday)

        // if(i===0)console.log(monitorShiftsArr)
        //Loop over shifts and populate table
        monitorShiftsArr.forEach( (shift, idx) => {
          //Reset locationMonitors for current shift
          locationMonitors = resetLocationToday(locationsToday)

          // Destructuring monitors
          shift.forEach(([monitorName, overtime, start, end, locationId]) => {
            locationMonitors[locationsToday[locationId].index][1] = 
              locationMonitors[locationsToday[locationId].index][1] === EMPTY
              ? monitorName //Replace "Unassigned"
              : locationMonitors[locationsToday[locationId].index][1] + `, ${monitorName}`//append w/ comma

            //Each row = one shift 
            rows[`shift_${idx}`] = {
              start: start,
              end: end,
              locationMonitors: locationMonitors,
              isOpenShift: overtime,
            }
          }) 
        }) 
        // if(i===0)console.log(rows)
        //Compile all 7 tables
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
        const [overtimeCalcs, _] = await allocateOvertime()
        // console.log(overtimeCalcs.thursday)

        //Behold, the Meat and Potatoes
        let weeklyTable = buildWeeklyTable(THISWEEK, monitors, regularShifts, openShifts, locations, overtimeCalcs)

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