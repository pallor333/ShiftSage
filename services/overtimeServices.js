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
const { getFixedTimeRange, getNextThurs } = require('../utils/dateHelpers')
const { monitorLookupByMonitorIdTable, openShiftLookupByOpenShiftIdTable} = require('../utils/lookupHelpers')

const THISWEEK = new Date("4/30/25") //temp hardcoding date:

/************** Helper functions *******************/
//Given monitor and overtimeShift, returns true/false for scheduling conflict
const checkShiftConflict = (monitor, overtimeShift) => {
    if(!monitor.regularShift) return false

    //1) check if openShift conflicts with regularShift
    const regularDays = monitor.regularShift.days // e.g. ["monday", "wednewday", "friday"]
    const overtimeDay = overtimeShift.day // e.g. "wednesday"

    //only check time overlap if days conflict
    if(!regularDays.includes(overtimeDay)) return false

    const [regStart, regEnd] = getFixedTimeRange(monitor.regularShift.startTime, monitor.regularShift.endTime)
    const [otStart, otEnd]   = getFixedTimeRange(overtimeShift.startTime, overtimeShift.endTime)

    //check for any overlap, true = no conflict dont get charged, false = conflict, get charged
    return (otStart < regEnd && otEnd > regStart)
} 

function findEligibleMonitorsAndCharge(openShiftObject, eligibleMonitorsByDay, currentMonitorId){
    //Creating a list of monitors who are eligible to get charged for this shift. 
    //checkShiftConflict() returns false for no charge but for filter we want a true
    const monitorsChargedHours = {}
    // return eligibleMonitorsByDay
    //     .filter(monitor => monitor._id.toString() !== currentMonitorId.toString() && !checkShiftConflict(monitor, openShiftObject))
    //     .map(monitor => monitor.name) //monitor._id) //monitor.name)

    //Changing function to return obj {monitorName: hoursChargedThisWeek}
    eligibleMonitorsByDay
        .filter(monitor => monitor._id.toString() !== currentMonitorId.toString() && !checkShiftConflict(monitor, openShiftObject))
        .forEach(monitor => monitorsChargedHours[monitor.name] = openShiftObject.totalHours)
    return monitorsChargedHours
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

//True = overlap + dont assign shift; False = no overlap + ok to assign shift
function monitorShiftOverlapConflict(assignedMonitors, monId, shiftTime){
    // assignedMonitors = { monitorId: {shift_1: [start/endTime], shift_2: [start/endTime], shift_3: [start/endTime]} }
    //monitor not assigned any shifts, immediately exit
    if(!assignedMonitors[monId] || !assignedMonitors[monId].time) return false

    const twoHoursInMilliseconds = 1000 * 60 * 60 * 2 //1000ms, 60s, 60min = 1 hr
    const [currSt, _] = shiftTime 
    const assignedShifts = assignedMonitors[monId].time

    //Loop over monitor's assigned shifts
    return assignedShifts.some(([assignedSt, _]) => {
        // start times within two hours of each other = overlap
        const smallSt = Math.min(currSt, assignedSt)
        const largeSt = Math.max(currSt, assignedSt)
        const plusTwoHrs = smallSt + twoHoursInMilliseconds
        // (start1) <= (start2) <= (start1 + 2 hrs)
        return (smallSt <= largeSt && largeSt <= plusTwoHrs)
    })
}

/************** Main function *******************/
function assignOvertimeShifts(overtimeBidMonitors, eligibleMonitorsByDay, openShiftByOpenShiftId){
    // let overtimeWinnersByOpenShift = {thursday: {locIds: []}, friday: {locIds: []}, saturday: {locIds: []}, sunday: {locIds: []}, monday: {locIds: []}, tuesday: {locIds: []}, wednesday: {locIds: []}}
    let assignedShifts = new Set() //Ensure two monitors don't get assigned the same shift
    let assignedMonitors = {} //Ensure monitor cannot pick up overlapping shift 
    const assignedShiftsByOrder = [] //arr of assigned ot obj

    let overtimeWinnersByOpenShift = new Map() //Creating map() for schema
    for (const day of ['thursday', 'friday', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday']) {
        overtimeWinnersByOpenShift.set(day, {
            locIds: [],
            shifts: new Map()
        })
    }

    //1)Sort overtimeBid monitors based on hours, if hrs equal then sort based upon seniority. 
    //Create new arr w/ map() to avoid mutating original
    let sortedOvertimeBidMonitors = overtimeBidMonitors.map(entry => ({ 
        ...entry, 
        rankings: [...entry.rankings] //clone rankings array
    })).sort( (a,b) => 
        a.monitor.hours - b.monitor.hours || a.monitor.seniority - b.monitor.seniority
    )

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
                const openShift = openShiftByOpenShiftId.get(shiftId) //grab openShift object from lookup table
                const startEnd = getFixedTimeRange(openShift.startTime, openShift.endTime)
                const monId = entry.monitor._id

                //Check if current shift overlaps in time with an assigned shift
                let isThereShiftOverlap = monitorShiftOverlapConflict(assignedMonitors, monId, startEnd)

                //Valid if shift_id is unique + current shift doesn't overlap with a shift taken by monitor
                if (!assignedShifts.has(shiftId) && !isThereShiftOverlap){  
                    assignedShifts.add(shiftId)
                    //Add new monitorId to assignedMonitors if it does not exist. else push startTime and endTime
                    !assignedMonitors[monId] 
                        ? assignedMonitors[monId] = {'time' : [startEnd]} //assign regular shift?
                        : assignedMonitors[monId].time.push(startEnd)
                    
                    if(openShift){
                        //2c) Return array of monitors to charge hours for NOT getting the shift for billing later
                        const chargeHoursToMonitors = findEligibleMonitorsAndCharge(openShift, eligibleMonitorsByDay[openShift.day], entry.monitor._id) 

                        //2d) Assigning monitor their first choice
                        //Add monitorId| thursday: { openShiftId456: monitorId, //..etc }
                        const dayEntry = overtimeWinnersByOpenShift.get(openShift.day)
                        dayEntry.shifts.set(shiftId, {
                            'monitorId' : entry.monitor._id, 
                            'monitorName' : entry.monitor.name,
                            'shiftName' : openShift.name, 
                            'locationId': openShift.location,
                        })
                        //const locIdStr = openShift.location.toString();
                        // if (!dayEntry.locIds.map(id => id.toString()).includes(locIdStr)) {
                        // dayEntry.locIds.push(openShift.location);
                        // }
                        
                        //2e) openShift location !== regularShift location, push to day.locIds arr
                        if((openShift.location?.scheduleType ?? []).length === 0){ 
                            dayEntry.locIds.push(openShift.location._id) 
                        }
                        // overtimeWinnersByOpenShift[openShift.day][shiftId] = { 
                        //     'monitorId' : entry.monitor._id, 
                        //     'monitorName' : entry.monitor.name,
                        //     'shiftName' : openShift.name, 
                        //     'locationId': openShift.location,
                        //     // 'monitorsToCharge': chargeHoursToMonitors,
                        // }

                        //2f) Pushing shifts in order of assignment
                        assignedShiftsByOrder.push({
                            'shiftName': openShift.name, 
                            'monitorName': entry.monitor.name, //winner
                            'hours': openShift.totalHours, 
                            'monitorsToCharge': chargeHoursToMonitors,
                        })


                    }
                    assigned = true
                }
                entry.rankings.shift() //2g)Remove the first assigned shift
            }
            return entry.rankings.length > 0 //keep this monitor in the pool if it still has rankings
        })
    }
    // overtimeWinnersByOpenShift is an object keyed by day -> use for scheduling
    // assignedShiftsByOrder is an array sorted by order of shift assignment -> use in auditing
    // console.log(overtimeWinnersByOpenShift)
    return [overtimeWinnersByOpenShift, assignedShiftsByOrder]
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
                // [{
                //   locIds[locId1, locId2, locId3, etc]
                //   thursday: {
                //     '6826495e9e8667f3047c5613': { //openShiftId
                //       monitorId: new ObjectId('6826563dd3f7526aff07d080'),
                //       monitorName: 'VACACHECK',
                //       shiftName: 'THU 5/1 RECYCLE 07:00 AM - 03:30 PM (8.5)',
                //       locationId: {
                //          _id: new ObjectId('6850e2d9841052db64eb4128'),
                //          name: '52OX',
                //          scheduleType: [Array],
                //          __v: 0
                //      },
                //      monitorsToCharge: [Array]
                //     }, //etc
                // [
                // {
                //   shiftName: 'THU 5/1 RECYCLE 07:00 AM - 03:30 PM (8.5)',
                //   monitorName: 'VACACHECK',
                //   hours: 8.5,
                //   monitorsToCharge: [Object]
                // },
                // {
                //   shiftName: 'THU 5/1 HBS 03:00 PM - 11:00 PM (8.0)',
                //   monitorName: 'VACACHECK2',
                //   hours: 8,
                //   monitorsToCharge: [Object]
                // },
                // {
                //   shiftName: 'SAT 5/3 NRTH 07:00 AM - 03:00 PM (8.0)',
                //   monitorName: 'TESTERONE',
                //   hours: 8,
                //   monitorsToCharge: [Object]
                // }, //etc
                // ]

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

    