const { Monitor, RegularShift, OpenShift, Location} = require("../models/Parking");
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

1) Loop over locations (alphabetical), push to tableSchedule based upon (weekday, weekend, everyday). How best to associate 
weekday/weekend/everyday with numbers? weekday = 0/1, 4-6. weekend = 2/3. everyday = 0-7.
2) Loop over shift times (earliest first), 


const THISWEEK = new Date("4/30/25")
const DAYMAPPING = { Monday: "MON", Tuesday: "TUE", Wednesday: "WED", Thursday: "THU", Friday: "FRI", Saturday: "SAT", Sunday: "SUN",};
//Helper function to get next Thurs
function getNextThurs(date){
  const day = date.getDay() //0 = Sun, 6 = Sat
  const wkStart = new Date(date)

  //Calculate days till next Thurs
  const daysUntilThursday = day <= 4 ? 4 - day : 4 - day + 7;
  wkStart.setDate(date.getDate() + daysUntilThursday);
  const wkEnd = new Date(wkStart.getTime() + 604800000); // 7 days in ms
  // day = 0 (sun) (5/18); 4 - 0 = 4; 5/18 + 4 = 5/22 (thur)  
  // day = 5 (fri) (5/23); 4 - 5 + 7 = 6; 5/23 + 6 = 5/29 (thurs)

  return [`${wkStart.getMonth() + 1}/${wkStart.getDate()}/${wkStart.getFullYear()}`, 
          `${wkEnd.getMonth() + 1}/${wkEnd.getDate()}/${wkEnd.getFullYear()}`
          ] //Return string in format month/day/year
}
// Helper function to format dates in MM/DD/YY format
    const formatDate = (date) => {
      const d = new Date(date);
      return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
    };


const [wkStart, wkEnd] = getNextThurs(THISWEEK), wkDays = []

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
//wkDays[i].split(",")[0].toLowerCase() turns 'Thursday, May 1, 2025' into 'thursday'
//Filter regularShifts into an array of days
const filteredShiftsByDay = wkDays.map(day => 
    regularShifts.filter(shift => 
        shift.days && shift.days.some(d => d.toLowerCase() === day.split(",")[0].toLowerCase())
    )
)
//location.scheduleType = [Weekday, Everyday, None]
//Filter locations by day
const filteredLocationsByDay = Array.from({ length: 7},(_,idx) => {
    const isWeekend = idx === 2 || idx === 3 //Sat (2) and Sun (3)
    return locations.filter(location =>  
        location.scheduleType === 'everyday' ? true 
        : location.scheduleType === 'none' ? false
        : !isWeekend
    )
})


module.exports = {
    allocateOvertime: async() => {
        try{
        }catch (err){
            console.error("Error, in allocateSchedule:", err)
            throw err
        }
    }
}

*/    


// Build a list of days (wkDays) and locations for each day.
// For each day:
// Get the list of locations (ordered).
// Get the list of shifts (ordered).
// For each shift, build an object mapping each location to the assigned monitor (or null if none).
// Push the locations as the first row, then each shift row.
// Push each day's table into a master array.

/*
// ...existing code...

function buildWeeklySchedule(wkDays, locations, regularShifts, monitors) {
  const weekTable = [];

  for (let i = 0; i < 7; i++) {
    const dayName = wkDays[i].split(",")[0]; // e.g., "Thursday"
    // Filter locations for this day (already done in your code)
    const dayLocations = locations[i].map(loc => loc.name);

    // Filter shifts for this day
    const dayShifts = regularShifts[i];

    // Build the table for this day
    const dayTable = [];
    // First row: locations
    dayTable.push(dayLocations);

    // For each shift, build a row object
    dayShifts.forEach(shift => {
      // Format shift time as string
      const shiftTime = `${new Date(shift.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${new Date(shift.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      const row = {};
      // For each location, find the monitor assigned
      dayLocations.forEach(locationName => {
        const monitor = monitors.find(m =>
          m.location?.name === locationName &&
          m.regularShift?.startTime.toString() === shift.startTime.toString() &&
          m.regularShift?.endTime.toString() === shift.endTime.toString() &&
          m.regularShift?.days?.includes(dayName)
        );
        row[locationName] = monitor ? monitor.name : null;
      });
      // Use shift time as the key for this row
      dayTable.push({ [shiftTime]: row });
    });

    weekTable.push(dayTable);
  }

  return weekTable;
}
  */