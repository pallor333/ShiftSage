/* DATE HELPER FUNCTIONS ****************************************************************/
// Helper function to calculate hours in a shift
const calculateShiftHours = (startTime, endTime) => {
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
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`
}

//Formats time in HH:MM
function formatTime(date) {
  // return date.toISOString().substring(11, 16) // "HH:MM"
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); //HH:MM
}

function getCurrentDay(wkStart, daysElapsedSinceThursday){
  let [m, d, y] = wkStart.split('/')
  d = +d + daysElapsedSinceThursday //Cast str -> int for addition
  return [m,d,y].join('/')  //new Date([m,d,y].join('/') )
}

//helper function to fix a start/end time for correct comparison
const getFixedTimeRange = (start, end) => {
    const startMs = new Date(start).getTime() //convert to milliseconds since epoch
    let endMs = new Date(end).getTime()  //e.g. "1970-01-01T23:00:00Z" becomes 82800000 (23 hours in ms)
    
    //shift wrapped past midnight, add one full day to correct: 27000000 + 86400000 = 113400000 // 7:30 AM next day
    //total milliseconds in a day = 24 hours × 60 minutes × 60 seconds × 1000 ms = 86,400,000 ms
    if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000
    return [startMs, endMs]
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
// Helper to convert 'HH:MM' to total minutes
function toMinutes(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number)
  return hour * 60 + minute
}

module.exports = { calculateShiftHours, convertDateToMDYY, formatDate, formatTime, getCurrentDay, getFixedTimeRange, getNextThurs, getNextThursDateObj, getPreviousDay, toMinutes}