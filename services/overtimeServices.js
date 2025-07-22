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
const { Monitor, OpenShift, OvertimeBid, RegularShift, VacationLookup} = require("../models/Parking")
const { convertDateToMDYY, formatTime, getFixedTimeRange, getFixedTimeRangeISO, getNextThursDateObj} = require('../utils/dateHelpers')
const { monitorLookupByMonitorIdTable, openShiftLookupByOpenShiftIdTable, regularShiftLookupByRegularShiftIdTable, vacationLookupByDateTable} = require('../utils/lookupHelpers')

const THISWEEK = new Date("4/30/25") //temp hardcoding date: //new Date("6/29/25")  

/************** Helper functions *******************/
//Given monitor and overtimeShift, returns true for regular/ot scheduling conflict
const checkShiftConflict = (monitor, overtimeShift) => {
    if(!monitor.regularShift) return false

    //1) check if openShift conflicts with regularShift
    const regularDays = monitor.regularShift.days // e.g. ["monday", "wednesday", "friday"]
    const overtimeDay = overtimeShift.day // e.g. "wednesday"
    const date = overtimeShift.date //e.g. 2025-05-01T04:00:00.000Z
    // if(monitor.name==='VACACHECK2'){ console.log(regularDays, overtimeDay, !regularDays.includes(overtimeDay)) } 
    //2) only check time overlap if days conflict
    if(!regularDays.includes(overtimeDay)) return false
    if(monitor.name==='VACACHECK2'){ console.log(overtimeShift.startTime, overtimeShift.endTime, date) }
    const [regStart, regEnd] = getFixedTimeRangeISO(monitor.regularShift.startTime, monitor.regularShift.endTime, date)
    const [otStart, otEnd]   = getFixedTimeRangeISO(overtimeShift.startTime, overtimeShift.endTime, date)

    //reg: 5:30am - 9am, ot: 12am - 7am
    //3) overlap → conflict → return true == conflict
    // const overlap = otStart < regEnd && otEnd > regStart
    // if(overlap) return true

    //4) check gap (true = conflict + charge, false = no conflict, no charge)
    const twoHoursInMs = 1000 * 60 * 60 * 2 //1000ms, 60s, 60min = 1 hr
    const startsWithinTwoHrsBefore = regStart - otStart;
    const early = Math.min(otStart, regStart)
    const later = Math.max(otStart, regStart)
    const plusTwoHrs = early + twoHoursInMs

    return plusTwoHrs >= later 
} 
//Helper: Has the current monitor bid on the current open shift? True = no bid => charge
function monitorHasBidOnOpenShift(monId, currentShiftId, monitorRankingTable){
    const currentBids = monitorRankingTable[monId]
    if (!currentBids) return true // If no bids, treat as DID NOT BID → eligible for charge

    // Given the one eligible monitor and the current shift:
    //Loop monitor's rankings for current shift. Found shift = they bid = false => no charge
    for(let entry in currentBids){
        if(currentBids[entry].position.toString() === currentShiftId.toString()) return false
    }

    return true //no bid found = true => charge
}
function findEligibleMonitorsAndCharge(openShiftObject, eligibleMonitorsByDay, currentMonitorId, monitorRankingTable){
    //Creating a list of monitors who are eligible to get charged for this shift. 
    //checkShiftConflict() returns false for no charge but for filter we want a true
    const monitorsChargedHours = {}, currentShiftId = openShiftObject._id
    // if(currentMonitorId.toString()==='6830d73bb73f6f94f7fab410'){ //QUINCY (129)
    //     console.log("Passed:", passedRanks[monId])
    //     console.log(openShiftObject)
    // }

    // console.log(eligibleMonitorsByDay)
    // Return obj {monitorName: hoursChargedThisWeek}
    //Charge Monitor if NOT self, NO time conflict and NOT bid on shift
    eligibleMonitorsByDay //True -> charge monitor
        .filter(monitor => {
            // console.log(monitor.name, monitor._id.toString() !== monId, !checkShiftConflict(monitor, openShiftObject), monitorHasBidOnOpenShift(monId, currentShiftId, monitorRankingTable))
            //return monitor._id.toString() !== currentMonitorId.toString() &&
            return !checkShiftConflict(monitor, openShiftObject) //charge those without conflict
            // && monitorHasBidOnOpenShift(monitor._id.toString(), currentShiftId, monitorRankingTable)
        })
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

    //Convert to M/D/YY
    // const strDate = convertDateToMDYY(date)
    //Each day, get date str and include monitors NOT on vaca
    dayNames.forEach((day, i) => {
        const currentDateStr = new Date(date.getTime() + i * msPerDay).toISOString().slice(0, 10)
        // console.log(`\n📅 ${day.toUpperCase()} (${currentDateStr})`)
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
//Regular: true = overlap + dont assign shift; False = no overlap + ok to assign shift
function monitorRegularShiftOverlapConflict(shiftTime, regStart, regEnd, monitorDays, openShiftDay){
    if(!monitorDays.includes(openShiftDay)) return false
    const twoHoursInMilliseconds = 1000 * 60 * 60 * 2 //1000ms, 60s, 60min = 1 hr
    const [currSt, _] = shiftTime 

    //1) Compare against regular shift first
    const [regularShiftStart, rEnd] = getFixedTimeRange(regStart, regEnd)
    const early = Math.min(currSt, regularShiftStart)
    const later = Math.max(currSt, regularShiftStart)
    const twoHrsLater = early + twoHoursInMilliseconds
    // start2 <= (start1 + 2 hrs) = ot overlaps with regular
    return later <= twoHrsLater
}
//Overtime true = overlap + dont assign shift; False = no overlap + ok to assign shift
function monitorOvertimeShiftOverlapConflict(assignedMonitors, monId, shiftTime){
    // assignedMonitors = { monitorId: {shift_1: [start/endTime], shift_2: [start/endTime], shift_3: [start/endTime]} }
    //1) Monitor not assigned any shifts, immediately exit
    if(!assignedMonitors[monId] || !assignedMonitors[monId].time) return false

    const twoHoursInMilliseconds = 1000 * 60 * 60 * 2 //1000ms, 60s, 60min = 1 hr
    const [currSt, _] = shiftTime 
    const assignedShifts = assignedMonitors[monId].time

    //2) Loop over monitor's assigned shifts
    return assignedShifts.some(([assignedSt, _]) => {
        // start times within two hours of each other = overlap
        const smallSt = Math.min(currSt, assignedSt)
        const largeSt = Math.max(currSt, assignedSt)
        const plusTwoHrs = smallSt + twoHoursInMilliseconds
        // (start1) <= (start2) <= (start1 + 2 hrs)
        return (smallSt <= largeSt && largeSt <= plusTwoHrs)
    })
}
//true = 3 shifts in a row, false means this shift would not create 3 shifts in a row
function threeInARow(assignedMonitors, monId, openShift, regShiftAttributes, workingMultipleOT){
    //monitor not assigned any shifts, immediately exit
    if(!assignedMonitors[monId] || !assignedMonitors[monId].time) return false
    //Monitor doesn't want to work more than 1 shift this week -> exit
    // if(!workingMultipleOT) return false
    //Is opentime shift on a day monitor normally works?
    const regShiftToday = regShiftAttributes.days.includes(openShift.day)
    const date = openShift.date

    //1) Grab reg shift, current ot shifts and assigned ot shifts in 'ms since epoch' format
    // True/false flag: set regularShift to empty if monitor doesn't normally work today
    const regularShift = regShiftToday ? getFixedTimeRangeISO(regShiftAttributes.start, regShiftAttributes.end, date) : []
    const newShift = getFixedTimeRangeISO(openShift.startTime, openShift.endTime, date)
    const existing = assignedMonitors[monId]?.time || [] // Get current shifts for this monitor.

    //2) Consolidate shifts via merge and sort by start time
    const allShifts = [regularShift, ...existing, newShift].sort((a, b) => a[0] - b[0]) 
    //debug
    // if(monId.toString()==='680bf5d07162e106742ea838'){
    //     console.log("reg start/end", regShiftAttributes.start, regShiftAttributes.end)
    //     console.log("ot start/end", openShift.startTime, openShift.endTime)
    //     console.log("regular shift:", regularShift)
    //     console.log("ot shift:", newShift)
    //     console.log(allShifts)
    // }
    //'680bf5d07162e106742ea838' === JEFFERSON
    // if(monId.toString()==='6830d73bb73f6f94f7fab410' && newShift[0] === 1746500400000){
    //     console.log(date, shift1, shift2, shift3)
    //     console.log(regularShift)
    //     console.log(existing)
    //     console.log(newShift)
    //     console.log("final product:", allShifts)
    //     console.log(regShiftToday)
    // }

    // Now scan for any 3 consecutive shifts chained together.
    for (let i = 0; i < allShifts.length - 2; i++) {
        const shift1 = allShifts[i]
        const shift2 = allShifts[i + 1]
        const shift3 = allShifts[i + 2]

        // Check if these three shifts form a consecutive block
        const diff1 = shift1[0] <= shift2[0] && shift1[1] >= shift2[0] //start1 <= start1 <= end1
        const diff2 = shift2[0] <= shift3[1] && shift2[1] >= shift3[0] //start2 <= start3 <= end2
        if (diff1 && diff2) {
            // console.log(`❗ Monitor ${monId} would have 3 consecutive shifts`);
            return true
        }
    }
    return false //no three consecutive shifts found
}


/************** Main function *******************/
function assignOvertimeShifts(eligibleMonitorsByDay, regularShiftTable, openShifts, openShiftByOpenShiftId, overtimeBidMonitors, monTable){ //, vacationByDate){
    // let overtimeWinnersByOpenShift = {thursday: {locIds: []}, friday: {locIds: []}, saturday: {locIds: []}, sunday: {locIds: []}, monday: {locIds: []}, tuesday: {locIds: []}, wednesday: {locIds: []}}
    let assignedShifts = new Set() //Ensure two monitors don't get assigned the same shift
    let assignedMonitors = {} //Ensure monitor cannot pick up overlapping shift 
    const assignedShiftsByOrder = [] //arr of assigned ot obj
    let discardedMonitorRankings = {} //list of ranking bids passed over
    const monitorRankingTable = {} //{monitor_.id : rankings: []} for checking bids 


    //0a)Creating map() for schema
    let overtimeWinnersByOpenShift = new Map() 
    for (const day of ['thursday', 'friday', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday']) {
        overtimeWinnersByOpenShift.set(day, {
            locIds: [],
            shifts: new Map()
        })
    }
    //0b)Populate the map w/ all overtime shifts + overtime locations
    openShifts.forEach(shift => {
        const dayEntry = overtimeWinnersByOpenShift.get(shift.day)
        // providing blank values to avoid errors = shiftId: {object}
        dayEntry.shifts.set(shift._id.toString(), {  
            'monitorId' : "",
            'monitorName' : "OPEN",
            'shiftName' : shift.name, 
            'locationId': shift.location._id,
        })
        
        //Add locationId if the scheduleType !includes this day && not a repeat 
        if( !((shift.location?.scheduleType ?? []).includes(shift.day)) && 
            !(dayEntry.locIds.map(id => id.toString()).includes(shift.location._id.toString())) 
        ){ 
            dayEntry.locIds.push(shift.location._id) 
        }
    })
    //1)Sort overtimeBid monitors based on hours, if hrs equal then sort based upon seniority. 
    //Create new arr w/ map() to avoid mutating original
    let sortedOvertimeBidMonitors = overtimeBidMonitors.map(entry => ({     
        ...entry, 
        rankings: [...entry.rankings], //clone rankings array
    })).sort( (a,b) => 
        a.monitor.hours - b.monitor.hours || a.monitor.seniority - b.monitor.seniority
    )
    // console.log(sortedOvertimeBidMonitors)

    //1a) Create keyed obj of monitorId : rankings 
    sortedOvertimeBidMonitors.forEach(entry => {
        //shallow copy to avoid entry.rankings.shift() later
        monitorRankingTable[entry.monitor._id] = entry.rankings.slice()
    })

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
                const openShift = openShiftByOpenShiftId.get(shiftId.toString()) //grab openShift object from lookup table
                const startEnd = getFixedTimeRangeISO(openShift.startTime, openShift.endTime, openShift.date)
                const monId = entry.monitor._id
                const workingMultipleOT = entry.workMoreThanOne

                const regShiftObj = regularShiftTable.get(entry.monitor.regularShift.toString())
                const regShiftAttributes = { 
                    start: regShiftObj.startTime,
                    end: regShiftObj.endTime,
                    type: regShiftObj.type,
                    days: regShiftObj.days,
                }

                //Check if current shift overlaps with an assigned shift or their regular shift
                const isThereRegularShiftOverlap = monitorRegularShiftOverlapConflict(startEnd, regShiftObj.startTime, regShiftObj.endTime, regShiftObj.days, openShift.day)
                const isThereOvertimeShiftOverlap = monitorOvertimeShiftOverlapConflict(assignedMonitors, monId, startEnd)
                //Prevent monitor working three consecutive shifts
                const areThereThreeShiftsInARow = threeInARow(assignedMonitors, monId, openShift, regShiftAttributes, workingMultipleOT)

                // console.log(entry.monitor.name, openShift.name, isThereRegularShiftOverlap)
                // console.log(entry.monitor.name, openShift.name, checkShiftConflict(regShiftPopulatedMonitor, openShift))
                // if(entry.monitor.name==="QUINCY") console.log(shiftId, !assignedShifts.has(shiftId), !isThereOvertimeShiftOverlap, !isThereRegularShiftOverlap, !areThereThreeShiftsInARow)

                //Valid if shift_id is unique + current shift doesn't overlap with a shift taken by monitor
                if (!assignedShifts.has(shiftId) && !isThereOvertimeShiftOverlap && !isThereRegularShiftOverlap && !areThereThreeShiftsInARow){  
                    assignedShifts.add(shiftId)
                    //Add new monitorId to assignedMonitors if it does not exist. else push startTime and endTime
                    !assignedMonitors[monId] 
                        ? assignedMonitors[monId] = {'time' : [startEnd]} //assign regular shift?
                        : assignedMonitors[monId].time.push(startEnd)
                    
                    if(openShift){
                        //2c) Return array of monitors being charged hours -> billing later
                        const chargeHoursToMonitors = findEligibleMonitorsAndCharge(openShift, eligibleMonitorsByDay[openShift.day], entry.monitor._id, monitorRankingTable) 

                        //2d) Assigning monitor their first choice  
                        //Add monitorId| thursday: { openShiftId456: monitorId, //..etc }
                        const dayEntry = overtimeWinnersByOpenShift.get(openShift.day)
                        dayEntry.shifts.set(shiftId, { //.set() overwrites value for existing key
                            'monitorId' : entry.monitor._id, 
                            'monitorName' : entry.monitor.name,
                            'shiftName' : openShift.name, 
                            'locationId': openShift.location,
                        })
                        
                        //2e) openShift location !== regularShift location, push to day.locIds arr
                        // if((openShift.location?.scheduleType ?? []).length === 0){ 
                        //     dayEntry.locIds.push(openShift.location._id) 
                        // }
                        // overtimeWinnersByOpenShift[openShift.day][shiftId] = { 
                        //     'monitorId' : entry.monitor._id, 
                        //     'monitorName' : entry.monitor.name,
                        //     'shiftName' : openShift.name, 
                        //     'locationId': openShift.location,
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
                //2g)Remove the first assigned shift + keep history
                entry.rankings.shift()
                // let discarded = entry.rankings.shift(), monIdStr = monId.toString()
                //Initialize if null/undefined then push value into arr
                // discardedMonitorRankings[monIdStr] ??= []
                // discardedMonitorRankings[monIdStr].push(discarded.position)
                // if(monId.toString()==='6830d73bb73f6f94f7fab410'){console.log("QUINCY history:", discardedMonitorRankings['6830d73bb73f6f94f7fab410']) }
            }
            return entry.rankings.length > 0 //keep this monitor in the pool if it still has rankings
        })
    }
    // overtimeWinnersByOpenShift is an object keyed by day -> use for scheduling
    // assignedShiftsByOrder is an array sorted by order of shift assignment -> use in auditing
    // console.log(overtimeWinnersByOpenShift.get('thursday'))
    // console.log(assignedShiftsByOrder)
    return [overtimeWinnersByOpenShift, assignedShiftsByOrder]
}

module.exports = {
    allocateOvertime: async() => {
        try{
            //1) Create list of monitors working each day of NEXT week. 
            //Convert date to 'YYYY-MM-DD' to match schema
            const [wkStart, wkEnd] = getNextThursDateObj(THISWEEK)
            // console.log(wkStart, wkEnd)
            // const [m, d, y] = wkStart.split("/").map(Number)
            // const formattedDate = new Date(y, m - 1, d) //2025-05-01T04:00:00.000Z or 5/1/25
            // const startDateObj = new Date(wkStart), endDateObj = new Date(wkEnd)

            //2) Grabbing data from DB
            //Using lean() bcos reading data and not calling .save() or Mongoose instance methods.
            const monitors = await Monitor.find().populate("regularShift location").sort( {hours: 1}).lean() //.lean() returns plain JS objects
            const monTable = monitorLookupByMonitorIdTable(monitors)
            // const vacaLookup = await VacationLookup.find().populate("monitorAndOpenShift.monitorId").populate("monitorAndOpenShift.openShiftId").sort({ day: 1 })
            const openShifts = await OpenShift.find({ // Dates >= 5/1/25 // Dates <= 5/7/25
                date: { $gte: wkStart, $lte: wkEnd } //grab shifts bound by start/end of next week
            }).populate("location").sort({ date: 1, startTime: 1})
            // console.log(openShifts)
            // console.log(wkStart.toISOString(), wkEnd.toISOString());

            const overtimeBidMonitors = await OvertimeBid.find().populate("monitor").lean() 
            const openShiftByOpenShiftId = openShiftLookupByOpenShiftIdTable(openShifts)
            // const vacationByDate = vacationLookupByDateTable(vacaLookup)
            
            const regularShifts = await RegularShift.find()
            const regularShiftTable = regularShiftLookupByRegularShiftIdTable(regularShifts)
            // const await monitors = Monitor.find().lean()


            //2.5) Remove monitors on vacation this week
            // {thursday: [list of monitor objects working today], friday: [monitor objects], etc} - 7 days
            let eligibleMonitorsByDay = monitorNoVacaThisWeek(monitors, wkStart) 
            // const result = monitorNoVacaThisWeek(monitors, new Date("2025-05-01"))

            //3) Sort working monitors with overtime bids and assign them openShifts.
            let overtimeWinners = assignOvertimeShifts(eligibleMonitorsByDay, regularShiftTable, openShifts, openShiftByOpenShiftId, overtimeBidMonitors, monTable) //, vacationByDate)
 
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

    