/* DATE HELPER FUNCTIONS ****************************************************************/
// Helper function to calculate hours in a shift
function calculateShiftHours(startTime, endTime){
  let diffInMilliseconds = endTime - startTime // Difference in milliseconds
  
  // Handle overnight shifts (endTime < startTime)
  if (diffInMilliseconds < 0) {
    diffInMilliseconds += 24 * 60 * 60 * 1000 // Add 24 hours in milliseconds
  }

  const diffInHours = diffInMilliseconds / (1000 * 60 * 60) // Convert to hours
  return diffInHours.toFixed(1) // Round to 1 decimal place
}
//Helper converts Date Objects or Strings to M/D/YY
function convertDateToMDYY(input) {
  let month, day, year;

  if (input instanceof Date) {
    month = String(input.getMonth() + 1).padStart(2, '0');
    day = String(input.getDate()).padStart(2, '0');
    year = String(input.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  }

  // If it's already a string like M/D/YY:
  if (typeof input === 'string') {
    const [m, d, y] = input.split('/');
    const fullYear = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    return new Date(fullYear, parseInt(m) - 1, parseInt(d));
  }

  throw new Error(`convertDateToMDYY: invalid input ${input}`);
}
// Helper function to format dates in MM/DD/YY format
function formatDate(date){
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`
}
//Formats time in HH:MM
function formatTime(date) {
  // return date.toISOString().substring(11, 16) // "HH:MM"
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: "America/New_York"}); //HH:MM
}
//Helper buildWeeklyTable(): Get exact date for day
function getCurrentDay(wkStart, daysElapsedSinceThursday){
  let [m, d, y] = wkStart.split('/')
  d = +d + daysElapsedSinceThursday //Cast str -> int for addition
  return [m,d,y].join('/')  //new Date([m,d,y].join('/') )
}
//helper function to fix a start/end time for correct comparison
function getFixedTimeRange(start, end){
    const startMs = new Date(start).getTime() //convert to milliseconds since epoch
    let endMs = new Date(end).getTime()  //e.g. "1970-01-01T23:00:00Z" becomes 82800000 (23 hours in ms)
    
    //shift wrapped past midnight, add one full day to correct: 27000000 + 86400000 = 113400000 // 7:30 AM next day
    //total milliseconds in a day = 24 hours × 60 minutes × 60 seconds × 1000 ms = 86,400,000 ms
    if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000
    return [startMs, endMs]
}
//Get fixed start/end that also takes into acc the day
function getFixedTimeRangeISO(startTime, endTime, shiftDate){ 
  // Clone dates to avoid mutation
  const start = new Date(startTime);
  const end = new Date(endTime);
  const date = new Date(shiftDate); //e.g. 2025-05-01T04:00:00Z

  // Set the dates to match the shift date
  start.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  end.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

  // Handle overnight shifts
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }
  
  return [start.getTime(), end.getTime()];
}
//Helper function to get next Thurs as String
function getNextThurs(date){
  const day = date.getDay() //0 = Sun, 6 = Sat
  const wkStart = new Date(date)

  //Calculate days till next Thurs
  const daysUntilThursday = day <= 4 ? 4 - day : 4 - day + 7;
  wkStart.setDate(date.getDate() + daysUntilThursday)
  const wkEnd = new Date(wkStart.getTime() + 518400000) //6 days in ms  
  // day = 0 (sun) (5/18); 4 - 0 = 4; 5/18 + 4 = 5/22 (thur)  
  // day = 5 (fri) (5/23); 4 - 5 + 7 = 6; 5/23 + 6 = 5/29 (thurs)

  return [`${wkStart.getMonth() + 1}/${wkStart.getDate()}/${String(wkStart.getFullYear()).slice(-2)}`, 
          `${wkEnd.getMonth() + 1}/${wkEnd.getDate()}/${String(wkEnd.getFullYear()).slice(-2)}`
          ] //Return string in format month/day/year
}
//Helper function to get next Thurs as Date
function getNextThursDateObj(date){
  const day = date.getDay() //0 = Sun, 6 = Sat
  const wkStart = new Date(date)

  //Calculate days till next Thurs
  const daysUntilThursday = day <= 4 ? 4 - day : 4 - day + 7;
  wkStart.setDate(date.getDate() + daysUntilThursday)
  const wkEnd = new Date(wkStart.getTime() + 518400000) //6 days in ms  
  // day = 0 (sun) (5/18); 4 - 0 = 4; 5/18 + 4 = 5/22 (thur)  
  // day = 5 (fri) (5/23); 4 - 5 + 7 = 6; 5/23 + 6 = 5/29 (thurs)

  return [wkStart, wkEnd] //Return as Date Object
}
//Helper function to get previous day
function getPreviousDay(dateStr) {
  // Parse the input date (M/D/YY)
  const [month, day, year] = dateStr.split('/').map(Number);
  const date = new Date(2000 + year, month - 1, day); // 2000 + year for YY support

  // Subtract 1 day (handles month/year rollover automatically)
  date.setDate(date.getDate() - 1);

  // Format back to M/D/YY
  const prevMonth = String(date.getMonth() + 1)
  const prevDay = String(date.getDate())
  const prevYear = String(date.getFullYear()).slice(-2);

  return `${prevMonth}/${prevDay}/${prevYear}`;
}
//Helper holidayOvertimeCreator(): Given this week, return holiday if found or false
function holidayNextWeek([wkStart, wkEnd], holidays){
  //need to call before function: const { holidays } = await fetchCommonData()
  const wkStartMonth = wkStart.getMonth() + 1, wkStartDay = wkStart.getDate()
  const wkEndDay = wkEnd.getDate(), year = String(wkEnd.getFullYear()).slice(-2)
  // console.log(wkStartMonth, wkStartDay, wkEndDay, year) //7 3 9 25

  for(let holiday of holidays){
    const day = holiday.day
    //holiday found = exit early
    if(holiday.month === wkStartMonth){
      if(wkStartDay <= day && day <= wkEndDay){
        return `${holiday.month}/${day}/${year}`
      }
    }
  }
  return false
}
//Helper to convert 'HH:MM' to total minutes
function toMinutes(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number)
  return hour * 60 + minute
}
//Helper holidayOvertimeCreator(): Given holiday, return regular shift id array
function qualifyingRegularShifts(dateHoliday, monitors, DAYSARRAY){
  //Qualifying shifts = 3rd shift day before + 1st and 2nd day of. 
  //need to call before function: const{ monitors } = await fetchCommonData() 
  // Finding the day of holiday + day before holiday
  const dateBefore = getPreviousDay(dateHoliday)
  const dayNumberized = (new Date(dateHoliday).getDay() + 3) % 7
  const holidayBefore = DAYSARRAY[dayNumberized-1], holidayToday = DAYSARRAY[dayNumberized]
  
  //Loop over Monitor's regular shifts to populate { thursday: [ { id: objectId, date: date, day: day, location: location } ] } 
  return monitors.reduce((obj, mon) => {
    const shift = mon.regularShift

    //populating day before holiday
    if(shift.days.includes(holidayBefore) && shift.type.includes("thirdShift")){ 
      if(!obj[holidayBefore]) obj[holidayBefore] = []
      obj[holidayBefore].push({
        id: shift._id,
        day: holidayBefore,
        date: dateBefore,
        location: mon.location,
      }) 
    } 
    //populating holiday
    if(shift.days.includes(holidayToday) && 
        (shift.type.includes("firstShift") || shift.type.includes("secondShift")) ){ 
      if(!obj[holidayToday]) obj[holidayToday] = []
      obj[holidayToday].push({
        id: shift._id,
        day: holidayToday,
        date: dateHoliday,
        location: mon.location,
      })
    }     

    return obj
  }, {})
}


module.exports = { 
  calculateShiftHours, convertDateToMDYY, 
  formatDate, formatTime, 
  getCurrentDay, getFixedTimeRange, getFixedTimeRangeISO, getNextThurs, getNextThursDateObj, getPreviousDay, 
  holidayNextWeek,
  toMinutes,
  qualifyingRegularShifts,
}