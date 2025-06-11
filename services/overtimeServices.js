// 0) Score each Overtime sheet and filter out empty entries -> each monitor has a list of preferences
// Every Monitors has Overtime Rankings. // let noVacaMonitors = monitorNoVacaThisWeek(monitors)
// 1) Duplicate list of monitors, removing all on vacation. 
// 2) Create 7 different monitor tables, one for each day of the week.
// Purpose: These are to be referenced later when augmenting hours. Compiling now reduces iterations later + efficiency.
//*****************************************************************************/ SHIFT ALLOCATION PHASE
// Grab monitors from OvertimeBid (Those who haven't submitted one aren't included)
// 2) Sort by hours (low -> high), if the hours are the same then sort by seniority.
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
const { Monitor, OpenShift, Location, OvertimeBid} = require("../models/Parking");
const { calculateShiftHours, formatDate, getNextThurs } = require('../utils/dateHelpers');
const DAYSARRAY = ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"]
//temp hardcoding date:
const THISWEEK = new Date("4/30/25")

const checkShiftConflict = (monitor, openShiftID) => {
    if(!monitor.regularShift) return false

    //Check if openShift conflicts with regularShift
    const regularDays = monitor.regularShift.days; // e.g. ["MON", "WED", "FRI"]
    const overtimeDay = overtimeShift.day; // e.g. "WED"
    const dayConflict = regularDays.includes(overtimeDay);

    // Check time overlap only if days conflict
    if (dayConflict) {
        const regularStart = new Date(monitor.regularShift.startTime);
        const regularEnd = new Date(monitor.regularShift.endTime);
        const overtimeStart = new Date(overtimeShift.startTime);
        const overtimeEnd = new Date(overtimeShift.endTime);

        // Time conflict exists if shifts overlap at all
        return overtimeStart < regularEnd && overtimeEnd > regularStart;
    }
    return false // No day conflict = available
}

//Object of arrays = {date: [], date: [], date: []}
function monitorNoVacaThisWeek(monitors, date){
    //loop over days array: workingMonitors[thursday] = (monitor)
    let workingMonitors = {thursday: [], friday: [], saturday: [], sunday: [], monday: [], tuesday: [], wednesday: [],}
    // Filter monitors out vacation by converting dates to strings
    DAYSARRAY.forEach(d => {
        let dateStr = date.toISOString().split('T')[0]
        workingMonitors[d] = ( monitors.filter(m => !m.vaca.some(v => v.toISOString().split('T')[0] === dateStr)) )
        date.setDate(date.getDate() + 1);
    })
    return workingMonitors
}

module.exports = {
    allocateOvertime: async() => {
        try{
            const monitors = await Monitor.find().populate("regularShift location").sort( {hours: 1}) //i think this is ascending (lowest first)
            const openShifts = await OpenShift.find().populate("location").sort({ date: 1, startTime: 1})
            const overtimeBidMonitors = await OvertimeBid.find().populate("monitor") //maybe sort by monitor id?
            const locations = await Location.find().sort({ name: 1})   
            // if count is different, then the sort is based on that. If count is the same, the first expression returns 0 which converts to false 
            // and the result of the second expression is used (i.e. the sort is based on year).
            // data.sort(function (a, b) {
            // return a.count - b.count || a.year - b.year;
            // })
            //Convert date to 'YYYY-MM-DD' to match schema
            const [wkStart, _] = getNextThurs(THISWEEK)
            const [m, d, y] = wkStart.split("/").map(Number)
            const formattedDate = new Date(y, m - 1, d)
            // {thursday: [list of monitor objects working today], friday: [monitor objects], etc} - 7 days
            let WorkingMonitors = monitorNoVacaThisWeek(monitors, formattedDate) 

            const stepByStepCharges= [] //track hours to add to each monitor
            const overtimeAssignments = {} //track shift assignments  {shift: monitor}
            //{shiftId: {monitor, shift}}

            //Avaliable defined as not on vacation
            // const avaliableMonitors = await Monitor.find( {vaca: false} ).populate('regularShift').lean().catch(err =>{
            //     console.error("Error fetching monitors:", err)
            //     throw err
            // })
            /*
            //Fetch bids with populated monitor data + sort by hours ascending
            const bids = await OvertimeBid.find()
                .populate({
                    path:"monitor",
                    select: "vaca name regularShift", //returning only what we need
                    populate: {path: "regularShift"}
                })
                .populate('rankings.position')
                .sort( {monitorHours: 1})
                .lean()
                
            //Filter out monitors on vacation + rankings empty
            //const eligibleBids = bids.filter(b => !b.monitor.vaca && b.rankings?.length > 0)
            //?. is optional chaining, safetly accessing .length if bid.rankings exists and is a safe way to access potential null/undefined values
            //if(eligibleBids.length > 0) return { monitorHoursAdded, overtimeWins: Object.values(overtimeWins)}

            //Shift allocation, #1 person gets their preferred bid. 
            //Outside loops over bid objects
            //Filter out monitors on vacation + rankings empty
            for(const bid of bids.filter(b => !b.monitor.vaca && b.rankings?.length)){
                const currentMonitor = bid.monitor 
                const chargeReport = {
                    monitorId: currentMonitor._id,
                    monitorName: currentMonitor.name,
                    assignedShift: null,
                    chargedMonitors: []
                }
                //Inside loops over object's rankings
                for(const ranking of bid.rankings){
                    const overtimeShift = ranking.position
                    // const overtimeShiftId = overtimeShift._id
                    //const shiftId = shift.toString()

                    //Skip shift if already assigned
                    //if(overtimeAssignments[shiftId]) continue
                    //Check if the position is already assigned
                    if(!overtimeAssignments[overtimeShift]){ 
                        overtimeAssignments[overtimeShift] = bid.monitor

                        //Charge all available monitors hours
                        const chargedMonitors = avaliableMonitors
                            .filter(m => !checkShiftConflict(m, overtimeShift))
                            .map(m => ({
                                monitorId: m._id,
                                name: m.name,
                                hoursAdded: shift.totalHours
                            }));

                        chargeReport.chargedMonitors = chargedMonitors;
                        stepByStepCharges.push(chargeReport);
                        break; //Exit the inner loop to move onto the next monitor
                    }
                    if (Object.keys(overtimeAssignments).length === bids.length) break; //avoid infinite loops?
                }
            }
            */
            // return {
            //     assignments: Object.values(overtimeAssignments),
            //     hourChargeSteps:stepByStepCharges,
            //     summary: generateSummary(stepByStepCharges)
            // }

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

    