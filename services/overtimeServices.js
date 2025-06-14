// 0) Score each Overtime sheet and filter out empty entries -> each monitor has a list of preferences
// Every Monitors has Overtime Rankings. // let noVacaMonitors = monitorNoVacaThisWeek(monitors)
// 1) Duplicate list of monitors, removing all on vacation. 
// 2) Create 7 different monitor tables, one for each day of the week.
// Purpose: These are to be referenced later when augmenting hours. Compiling now reduces iterations later + efficiency.
//*****************************************************************************/ SHIFT ALLOCATION PHASE
// Grab monitors from OvertimeBid (Those who haven't submitted one aren't included)
// 0) Sort by hours (low -> high), if the hours are the same then sort by seniority.
// 	The first person on the list gets their #1 shift. (e.g. THURS, HBS, 11:00pm - 7:30am)
// 1a) If hours conflict, then the one with the highest seniority wins. 
//*****************************************************************************/ CALCULATION PHASE
// List of all monitors:
// 1) Check those monitors if they work at that time (11:00pm - 7:30am) If they do then they get removed
// from the list. 
// 2) Looped over monitor list once => bill every single monitor the hours of that Overtime shift (8.0 hrs)
// 3) Record this for display + audit purposes
// 4) Check the next highest hour person.
//*****************************************************************************/ Once at the end, return 
// 1) List of overtime shifts
// 2) hours added to each monitor 
const { Monitor, OpenShift, Location, OvertimeBid} = require("../models/Parking")
const { getNextThurs } = require('../utils/dateHelpers')
const { monitorLookupByMonitorIdTable, openShiftLookupByOpenShiftIdTable} = require('../utils/lookupHelpers')

const THISWEEK = new Date("4/30/25") //temp hardcoding date:

//Given monitor and overtimeShift, returns true/false for scheduling conflict
const checkShiftConflict = (monitor, overtimeShift) => {
    if(!monitor.regularShift) return false

    //check if openShift conflicts with regularShift
    const regularDays = monitor.regularShift.days; // e.g. ["monday", "wednewday", "friday"]
    const overtimeDay = overtimeShift.day; // e.g. "wednesday"

    //only check time overlap if days conflict
    if(!regularDays.includes(overtimeDay)) return false

    //total milliseconds in a day = 24 hours × 60 minutes × 60 seconds × 1000 ms = 86,400,000 ms
    const MILLI_IN_DAY = 24 * 60 * 60 * 1000; 
    //helper function to fix a start/end time for correct comparison
    const getFixedTimeRange = (start, end) => {
        const startMs = new Date(start).getTime() //convert to milliseconds since epoch
        let endMs = new Date(end).getTime()  //e.g. "1970-01-01T23:00:00Z" becomes 82800000 (23 hours in ms)
        //shift wrapped past midnight, add one full day to correct: 27000000 + 86400000 = 113400000 // 7:30 AM next day
        if (endMs <= startMs) endMs += MILLI_IN_DAY; 
        return [startMs, endMs]
    }

    const [regStart, regEnd] = getFixedTimeRange(monitor.regularShift.startTime, monitor.regularShift.endTime)
    const [otStart, otEnd]   = getFixedTimeRange(overtimeShift.startTime, overtimeShift.endTime)

    //check for any overlap, true = no conflict dont get charged, false = conflict, get charged
    return otStart < regEnd && otEnd > regStart
}

//Object of arrays = {date: [], date: [], date: []}
function monitorNoVacaThisWeek(monitors, date){
    //loop over days array: workingMonitors[thursday] = (monitor)
    let workingMonitors = { thursday: [], friday: [], saturday: [], sunday: [], monday: [], tuesday: [], wednesday: [] }
    const dayNames = Object.keys(workingMonitors) //grab days of week from workingMonitors
    const msPerDay = 24 * 60 * 60 * 1000 //total ms in a day, used to calculate day offsets

    //Proprocess monitor vacation dates with a Set of YYYY-MM-DD strings 
    const monitorsWithVacaSet = monitors.map(m => {
        const vacaSet = new Set(m.vaca.map(d => d.toISOString().slice(0, 10)))
        // console.log(`${m.name} vacation set:`, vacaSet);
        return { ...m, vacaSet } 
    })

    //Each day, get date str and include monitors NOT on vaca
    dayNames.forEach((day, i) => {
        const currentDateStr = new Date(date.getTime() + i * msPerDay).toISOString().slice(0, 10)
        // console.log(`\n📅 ${day.toUpperCase()} (${currentDateStr})`)
        // workingMonitors[day] = monitorsWithVacaSet.filter(m => !m.vacaSet.has(currentDateStr))
        workingMonitors[day] = monitorsWithVacaSet.filter(m => {
            const isOnVacation = m.vacaSet.has(currentDateStr);
            // console.log(`  - ${m.name}: ${isOnVacation ? "❌ ON VACATION" : "✅ AVAILABLE"}`);
            return !isOnVacation;
        })
        
    })
    //Returns an array of monitor objects who are not on vacation keyed by day
    return workingMonitors
    // Filter monitors on vacation by converting dates to strings
    // DAYSARRAY.forEach(d => {
    //     let dateStr = date.toISOString().split('T')[0]
    //     workingMonitors[d] = ( monitors.filter(m => !m.vaca.some(v => v.toISOString().split('T')[0] === dateStr)) )
    //     date.setDate(date.getDate() + 1);
    // }) // console.log(workingMonitors.thursday)
    // return workingMonitors //Duplicate list of monitors, removing all on vacation and creating a monitor array for each day of the week
}

function findEligibleMonitors(openShiftObject, eligibleMonitorsByDay, currentMonitorId){
    //Creating a list of monitors who are eligible to get charged for this shift. 
    //checkShiftConflict() returns false for no charge but for filter we want a true
    return eligibleMonitorsByDay
        .filter(monitor => monitor._id.toString() !== currentMonitorId.toString() && !checkShiftConflict(monitor, openShiftObject))
        .map(monitor => monitor._id) //monitor.name)
}

function assignOvertimeShifts(overtimeBidMonitors, eligibleMonitorsByDay, openShiftByOpenShiftId){
    let overtimeWinnersByOpenShift = {thursday: {}, friday: {}, saturday: {}, sunday: {}, monday: {}, tuesday: {}, wednesday: {},}
    const rankingSlots = [] //Place all bids in linear order
    let assignedShifts = new Set() //Ensure two monitors don't get assigned the same shift

    //1)Sort overtimeBid monitors based on hours, if hrs equal then sort based upon seniority. 
    //Create new arr w/ map() to avoid mutating original
    let sortedOvertimeBidMonitors = overtimeBidMonitors.map(entry => ({ 
        ...entry, 
        rankings: [...entry.rankings] //clone rankings array
    })).sort( (a,b) => 
        a.monitor.hours - b.monitor.hours || a.monitor.seniority - b.monitor.seniority
    )
    // console.log(overtimeBidMonitors)
    // console.log(sortedOvertimeBidMonitors)
    //2a)Loop over sortedOvertimeBidMonitors, assigning their first choice of shift
    while(sortedOvertimeBidMonitors.length > 0){ 
        sortedOvertimeBidMonitors = sortedOvertimeBidMonitors.filter(entry => { 
            //Outer loop continues until no monitors left
            //Inner loop removes monitors when entry.rankings is empty
            if(entry.rankings.length === 0) return false //remove monitors with no bids left

            let assigned = false //counter tracking if a value was added to overtimeWinners
            //2b) Ensure openShift is not assigned to more than one person
            while(entry.rankings.length > 0 && !assigned){
                const shiftId = entry.rankings[0].position.toString() //From monitor's first pick get openShift_id

                if (!assignedShifts.has(shiftId)){  //Check if shift_id is unique
                    assignedShifts.add(shiftId)
                    const openShift = openShiftByOpenShiftId.get(shiftId) //grab openShift from lookup table
                    
                    if(openShift){
                        //2c)Return array of monitors to charge hours for NOT getting the shift for billing later
                        const eligibleMonitors = findEligibleMonitors(openShift, eligibleMonitorsByDay[openShift.day], entry.monitor._id) 
                    
                        //2d) Assigning monitor their first choice
                        //Add monitorId| thursday: { openShiftId456: monitorId, //..etc }
                        overtimeWinnersByOpenShift[openShift.day][shiftId] = { 
                            'monitorId' : entry.monitor._id, 
                            'monitorName' : entry.monitor.name,
                            'shiftName' : openShift.name, 
                            'monitorsToCharge': eligibleMonitors,
                        }
                    }
                    assigned = true
                }
                entry.rankings.shift() //2e)Remove the first assigned shift NEED TO NOT LOOP OVER
            }
            return entry.rankings.length > 0 //keep this monitor in the pool if it still has rankings
        })
    }
    // console.log(overtimeWinnersByOpenShift)
    return overtimeWinnersByOpenShift
}

module.exports = {
    allocateOvertime: async() => {
        try{
            //Using lean() bcos reading data and not calling .save() or Mongoose instance methods.
            const monitors = await Monitor.find().populate("regularShift location").sort( {hours: 1}).lean() //.lean() returns plain JS objects
            const openShifts = await OpenShift.find().populate("location").sort({ date: 1, startTime: 1})
            const overtimeBidMonitors = await OvertimeBid.find().populate("monitor").lean() //maybe sort by monitor id?
            const openShiftByOpenShiftId = openShiftLookupByOpenShiftIdTable(openShifts)

            //1) Create list of monitors working each day of NEXT week. 
            //Convert date to 'YYYY-MM-DD' to match schema
            const [wkStart, _] = getNextThurs(THISWEEK)
            const [m, d, y] = wkStart.split("/").map(Number)
            const formattedDate = new Date(y, m - 1, d) //2025-05-01T04:00:00.000Z or 5/1/25

            // {thursday: [list of monitor objects working today], friday: [monitor objects], etc} - 7 days
            let eligibleMonitorsByDay = monitorNoVacaThisWeek(monitors, formattedDate) 
            // const result = monitorNoVacaThisWeek(monitors, new Date("2025-05-01"))

            //2) Sort working monitors with overtime bids and assign them openShifts.
            let overtimeWinners = assignOvertimeShifts(overtimeBidMonitors, eligibleMonitorsByDay, openShiftByOpenShiftId)
            
            return overtimeWinners
                // {
                //   thursday: {
                //     '6826495e9e8667f3047c5613': {
                //       monitorId: new ObjectId('6826563dd3f7526aff07d080'),
                //       monitorName: 'VACACHECK',
                //       shiftName: 'THU 5/1 RECYCLE 07:00 AM - 03:30 PM (8.5)',
                //       monitorsToCharge: [Array]
                //     }, //etc

        }catch (err){
            console.error("Error, in allocateOvertime:", err)
            throw err
        }
    }
}
// workingMonitors ==>
    // _id: new ObjectId('680bf5d07162e106742ea838'),
    // id: 130,
    // name: 'JEFFERSON',
    // regularShift: {
    //   _id: new ObjectId('680c069e0c35e34c1fd0991f'),
    //   name: 'Weekend Second Shift',
    //   days: [Array],
    //   startTime: 1970-01-01T19:45:00.000Z,
    //   endTime: 1970-01-01T05:00:00.000Z,
    //   __v: 0
    // },

    