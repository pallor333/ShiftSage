/**
 * Location class to define a parking location
 */
class Location {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
}

/**
 * ShiftTime class to define a standard shift time pattern
 */
class ShiftTime {
  constructor(name, startTime, endTime) {
    this.name = name;        // e.g., "Morning", "Afternoon", "Night"
    this.startTime = startTime;  // e.g., "07:00"
    this.endTime = endTime;      // e.g., "15:00"
  }
}

/**
 * RegularShift class to define a monitor's regular work pattern
 */
class RegularShift {
  constructor(location, shiftTime, days) {
    this.location = location;    // Location object
    this.shiftTime = shiftTime;  // ShiftTime object
    this.days = days;            // Array of weekdays e.g., ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }
}

/**
 * ParkingMonitor class to represent an individual monitor
 */
class ParkingMonitor {
  constructor(id, displayName, regularShift, hoursWorked, seniority) {
    this.id = id;
    this.displayName = displayName;
    this.regularShift = regularShift;  // RegularShift object
    this.hoursWorked = hoursWorked;    // Total hours worked so far
    this.seniority = seniority;        // Date when they started
    this.vacation = [];                // Array of date ranges when on vacation
    //this.unavailableTimes = [];        // Array of specific unavailable times
    this.overtimePreferences = {};     // Map of shift IDs to preference ranks
    this.wantsOvertime = true;         // Flag to indicate if monitor wants OT
  }

  /**
   * Add a vacation period
   * @param {Date} startDate - Start of vacation
   * @param {Date} endDate - End of vacation
   */
  addVacation(startDate, endDate) {
    this.vacation.push({ startDate, endDate });
  }

  /**
   * Add a specific unavailable time
   * @param {Date} startDateTime - Start of unavailable time
   * @param {Date} endDateTime - End of unavailable time
   * @param {string} reason - Reason for unavailability (optional)
   */
  addUnavailableTime(startDateTime, endDateTime, reason = "") {
    this.unavailableTimes.push({ startDateTime, endDateTime, reason });
  }

  /**
   * Set overtime preferences for a given week
   * @param {Object} preferences - Map of shift IDs to preferences (1 is highest)
   */
  setOvertimePreferences(preferences) {
    this.overtimePreferences = preferences;
    this.wantsOvertime = Object.keys(preferences).length > 0;
  }

  /**
   * Check if monitor is on vacation on a specific date
   * @param {Date} date - Date to check
   * @returns {boolean} - True if on vacation
   */
  isOnVacation(date) {
    return this.vacation.some(v => 
      date >= v.startDate && date <= v.endDate
    );
  }

  /**
   * Check if monitor is available at a specific time
   * @param {Date} startDateTime - Start of time to check
   * @param {Date} endDateTime - End of time to check
   * @returns {boolean} - True if available (not unavailable)
   */
  isAvailable(startDateTime, endDateTime) {
    // Check if unavailable due to specific unavailability
    const hasConflict = this.unavailableTimes.some(u => 
      isTimeOverlap(u.startDateTime, u.endDateTime, startDateTime, endDateTime)
    );
    
    return !hasConflict;
  }

  /**
   * Check if date/time conflicts with regular shift
   * @param {Date} date - Date to check
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @returns {boolean} - True if there's a conflict
   */
  conflictsWithRegularShift(date, startTime, endTime) {
    // Get day of week as lowercase string
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    // Check if monitor works on this day
    if (!this.regularShift.days.includes(dayOfWeek)) {
      return false; // No conflict if monitor doesn't work this day
    }
    
    // Create datetime objects for the shift we're checking
    const shiftStart = createDateTime(date, startTime);
    const shiftEnd = createDateTime(date, endTime);
    
    // Handle overnight shifts
    if (shiftEnd < shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }
    
    // Create datetime objects for the monitor's regular shift on this day
    const regularStart = createDateTime(date, this.regularShift.shiftTime.startTime);
    const regularEnd = createDateTime(date, this.regularShift.shiftTime.endTime);
    
    // Handle overnight regular shifts
    if (regularEnd < regularStart) {
      regularEnd.setDate(regularEnd.getDate() + 1);
    }
    
    // Check for overlap
    return isTimeOverlap(regularStart, regularEnd, shiftStart, shiftEnd);
  }
}

/**
 * OvertimeShift class to represent an available overtime shift
 */
class OvertimeShift {
  constructor(id, location, date, startTime, endTime, isPermanent = false) {
    this.id = id;
    this.location = location;    // Location object
    this.date = date;            // Date object
    this.startTime = startTime;  // e.g., "07:00"
    this.endTime = endTime;      // e.g., "15:00"
    this.isPermanent = isPermanent;  // Flag for recurring shifts
    this.hours = calculateHours(startTime, endTime);
    this.assignedMonitorId = null;
    this.eligibleMonitors = [];
  }
}

/**
 * OvertimeScheduler class to manage the entire scheduling process
 */
class OvertimeScheduler {
  constructor() {
    this.locations = [];
    this.shiftTimes = [];
    this.monitors = [];
    this.overtimeShifts = [];
    this.permanentShifts = [];
    this.nextId = {
      location: 1,
      monitor: 1,
      shift: 1
    };
  }

  /**
   * Add a new location
   * @param {string} name - Location name
   * @param {string} address - Location address (optional)
   * @returns {Location} - The created location
   */
  addLocation(name, address = "") {
    const location = new Location(this.nextId.location++, name, address);
    this.locations.push(location);
    return location;
  }

  /**
   * Add a new shift time pattern
   * @param {string} name - Shift name
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @returns {ShiftTime} - The created shift time
   */
  addShiftTime(name, startTime, endTime) {
    const shiftTime = new ShiftTime(name, startTime, endTime);
    this.shiftTimes.push(shiftTime);
    return shiftTime;
  }

  /**
   * Add a new monitor
   * @param {string} displayName - Monitor's name
   * @param {RegularShift} regularShift - Monitor's regular shift
   * @param {number} hoursWorked - Initial hours worked
   * @param {Date} seniority - Seniority date
   * @returns {ParkingMonitor} - The created monitor
   */
  addMonitor(displayName, regularShift, hoursWorked = 0, seniority = new Date()) {
    const monitor = new ParkingMonitor(
      this.nextId.monitor++, 
      displayName, 
      regularShift, 
      hoursWorked, 
      seniority
    );
    this.monitors.push(monitor);
    return monitor;
  }

  /**
   * Add a new overtime shift
   * @param {Location} location - Shift location
   * @param {Date} date - Shift date
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @param {boolean} isPermanent - Whether this is a permanent shift
   * @returns {OvertimeShift} - The created shift
   */
  addOvertimeShift(location, date, startTime, endTime, isPermanent = false) {
    const shift = new OvertimeShift(
      this.nextId.shift++,
      location,
      date,
      startTime,
      endTime,
      isPermanent
    );
    
    if (isPermanent) {
      this.permanentShifts.push(shift);
    } else {
      this.overtimeShifts.push(shift);
    }
    
    return shift;
  }

  /**
   * Generate weekly overtime shifts from permanent shifts
   * @param {Date} weekStartDate - Start date of the week
   */
  generateWeeklyShiftsFromPermanent(weekStartDate) {
    // Clone the date to avoid modifying the original
    const weekStart = new Date(weekStartDate);
    
    // Set to Monday of the given week
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    
    // For each permanent shift
    for (const pShift of this.permanentShifts) {
      // Get day of week for this permanent shift
      const dayOfWeek = pShift.date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Calculate the date for this day in the current week
      const shiftDate = new Date(weekStart);
      shiftDate.setDate(shiftDate.getDate() + (dayOfWeek - 1 + 7) % 7);
      
      // Create a new overtime shift for this week
      this.addOvertimeShift(
        pShift.location,
        shiftDate,
        pShift.startTime,
        pShift.endTime,
        false // Not permanent (this is an instance)
      );
    }
  }

  /**
   * Clear all non-permanent overtime shifts
   */
  clearWeeklyShifts() {
    this.overtimeShifts = this.overtimeShifts.filter(shift => shift.isPermanent);
  }

  /**
   * Check if a monitor is eligible for an overtime shift
   * @param {ParkingMonitor} monitor - The monitor to check
   * @param {OvertimeShift} shift - The overtime shift
   * @returns {boolean} - True if eligible
   */
  isMonitorEligibleForShift(monitor, shift) {
    // Skip if monitor doesn't want overtime
    if (!monitor.wantsOvertime) return false;
    
    // Skip if monitor has no preference for this shift
    if (!monitor.overtimePreferences[shift.id]) return false;
    
    // Skip if monitor is on vacation
    if (monitor.isOnVacation(shift.date)) return false;
    
    // Create datetime objects for the shift
    const shiftStart = createDateTime(shift.date, shift.startTime);
    const shiftEnd = createDateTime(shift.date, shift.endTime);
    
    // Handle overnight shifts
    if (shiftEnd < shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }
    
    // Check for conflict with regular shift
    if (monitor.conflictsWithRegularShift(shift.date, shift.startTime, shift.endTime)) {
      return false;
    }
    
    // Check for conflict with unavailable times
    if (!monitor.isAvailable(shiftStart, shiftEnd)) {
      return false;
    }
    
    return true;
  }

  /**
   * Process overtime assignments for all shifts
   * @returns {Array} - The assigned shifts
   */
  processOvertimeAssignments() {
    // Store the original hours for logging
    const originalHours = {};
    this.monitors.forEach(m => originalHours[m.id] = m.hoursWorked);
    
    // Sort shifts by date/time for consistent processing
    const sortedShifts = [...this.overtimeShifts].sort((a, b) => {
      // First by date
      const dateComp = a.date - b.date;
      if (dateComp !== 0) return dateComp;
      
      // Then by start time
      return a.startTime.localeCompare(b.startTime);
    });
    
    // Process each shift
    for (const shift of sortedShifts) {
      // Find eligible monitors
      const eligibleMonitors = this.monitors.filter(m => 
        this.isMonitorEligibleForShift(m, shift)
      );
      
      shift.eligibleMonitors = eligibleMonitors.map(m => m.id);
      
      if (eligibleMonitors.length === 0) {
        console.log(`No eligible monitors for shift at ${shift.location.name} on ${formatDate(shift.date)}`);
        continue;
      }
      
      // Sort eligible monitors by preference, then hours, then seniority
      const sortedMonitors = [...eligibleMonitors].sort((a, b) => {
        // First by preference (lower rank = higher preference)
        const prefA = a.overtimePreferences[shift.id] || Infinity;
        const prefB = b.overtimePreferences[shift.id] || Infinity;
        if (prefA !== prefB) return prefA - prefB;
        
        // Then by hours worked
        if (a.hoursWorked !== b.hoursWorked) return a.hoursWorked - b.hoursWorked;
        
        // Finally by seniority
        return a.seniority - b.seniority;
      });
      
      // Assign to first monitor (highest preference or least hours)
      const assignedMonitor = sortedMonitors[0];
      shift.assignedMonitorId = assignedMonitor.id;
      
      console.log(`Assigned shift at ${shift.location.name} on ${formatDate(shift.date)} to ${assignedMonitor.displayName} (preference: ${assignedMonitor.overtimePreferences[shift.id]})`);
      
      // Charge hours to all eligible monitors
      for (const monitor of eligibleMonitors) {
        monitor.hoursWorked += shift.hours;
      }
    }
    
    // Log hour changes
    this.monitors.forEach(m => {
      const hourChange = m.hoursWorked - originalHours[m.id];
      if (hourChange > 0) {
        console.log(`${m.displayName}: ${originalHours[m.id]} -> ${m.hoursWorked} (+${hourChange})`);
      }
    });
    
    return sortedShifts.filter(s => s.assignedMonitorId !== null);
  }

  /**
   * Generate a formatted schedule
   * @param {Array} assignedShifts - Shifts that have been assigned
   * @returns {Object} - Formatted schedule
   */
  generateSchedule(assignedShifts = null) {
    const shifts = assignedShifts || this.overtimeShifts.filter(s => s.assignedMonitorId !== null);
    
    const schedule = {
      locations: {},
      monitorAssignments: {}
    };
    
    // Group shifts by location
    for (const shift of shifts) {
      const locationId = shift.location.id;
      
      if (!schedule.locations[locationId]) {
        schedule.locations[locationId] = {
          name: shift.location.name,
          shifts: []
        };
      }
      
      const monitor = this.monitors.find(m => m.id === shift.assignedMonitorId);
      const monitorName = monitor ? monitor.displayName : "Unassigned";
      
      schedule.locations[locationId].shifts.push({
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        monitorId: shift.assignedMonitorId,
        monitorName
      });
      
      // Also track by monitor
      if (shift.assignedMonitorId) {
        if (!schedule.monitorAssignments[shift.assignedMonitorId]) {
          schedule.monitorAssignments[shift.assignedMonitorId] = {
            name: monitorName,
            shifts: []
          };
        }
        
        schedule.monitorAssignments[shift.assignedMonitorId].shifts.push({
          locationName: shift.location.name,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime
        });
      }
    }
    
    return schedule;
  }
}

// Utility functions

/**
 * Calculate full datetime from day and time string
 * @param {Date} baseDate - The date part (year, month, day)
 * @param {string} timeString - Time in format "HH:MM"
 * @returns {Date} - Full datetime
 */
function createDateTime(baseDate, timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const dateTime = new Date(baseDate);
  dateTime.setHours(hours, minutes, 0, 0);
  return dateTime;
}

/**
 * Check if two time ranges overlap
 * @param {Date} start1 - Start of first range
 * @param {Date} end1 - End of first range
 * @param {Date} start2 - Start of second range
 * @param {Date} end2 - End of second range
 * @returns {boolean} - True if ranges overlap
 */
function isTimeOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}

/**
 * Format a date for display
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Calculate hours between two times
 * @param {string} startTime - Start time (HH:MM)
 * @param {string} endTime - End time (HH:MM)
 * @returns {number} - Hours between times
 */
function calculateHours(startTime, endTime) {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  
  let hours = endHours - startHours;
  let minutes = endMinutes - startMinutes;
  
  // Handle overnight shifts
  if (hours < 0) {
    hours += 24;
  }
  
  // Convert minutes to fraction of hour
  const totalHours = hours + minutes / 60;
  
  return Math.round(totalHours * 10) / 10; // Round to 1 decimal place
}

// Example usage
function runDemo() {
  const scheduler = new OvertimeScheduler();
  
  // Add locations
  const downtown = scheduler.addLocation("Downtown", "123 Main St");
  const airport = scheduler.addLocation("Airport", "789 Airport Rd");
  
  // Add shift times
  const morningShift = scheduler.addShiftTime("Morning", "07:00", "15:00");
  const afternoonShift = scheduler.addShiftTime("Afternoon", "15:00", "23:00");
  const nightShift = scheduler.addShiftTime("Night", "23:00", "07:00");
  
  // Add monitors with regular shifts
  const smith = scheduler.addMonitor(
    "Smith",
    new RegularShift(downtown, morningShift, ["monday", "tuesday", "wednesday", "thursday", "friday"]),
    210.5,
    new Date("2022-05-15")
  );
  
  const johnson = scheduler.addMonitor(
    "Johnson",
    new RegularShift(downtown, afternoonShift, ["monday", "tuesday", "wednesday", "thursday", "friday"]),
    195.2,
    new Date("2023-01-10")
  );
  
  const davis = scheduler.addMonitor(
    "Davis",
    new RegularShift(downtown, nightShift, ["monday", "tuesday", "wednesday", "thursday", "friday"]),
    225.0,
    new Date("2021-11-20")
  );
  
  const wilson = scheduler.addMonitor(
    "Wilson",
    new RegularShift(airport, morningShift, ["monday", "tuesday", "wednesday", "thursday", "friday"]),
    180.0,
    new Date("2022-08-01")
  );
  
  const martinez = scheduler.addMonitor(
    "Martinez",
    new RegularShift(airport, afternoonShift, ["monday", "tuesday", "wednesday", "thursday", "friday"]),
    205.5,
    new Date("2023-03-15")
  );
  
  // Add some unavailability
  wilson.addUnavailableTime(
    new Date("2025-04-22T18:00:00"),
    new Date("2025-04-22T21:00:00"),
    "Class"
  );
  
  martinez.addVacation(
    new Date("2025-04-21"),
    new Date("2025-04-25")
  );
  
  // Add overtime shifts for the week
  const tueMorningDowntown = scheduler.addOvertimeShift(
    downtown,
    new Date("2025-04-22"), // Tuesday
    "07:00",
    "15:00"
  );
  
  const tueEveningAirport = scheduler.addOvertimeShift(
    airport,
    new Date("2025-04-22"), // Tuesday
    "15:00",
    "23:00"
  );
  
  const wedOvernightDowntown = scheduler.addOvertimeShift(
    downtown,
    new Date("2025-04-23"), // Wednesday
    "23:00",
    "07:00"
  );
  
  // Set overtime preferences
  smith.setOvertimePreferences({
    [tueMorningDowntown.id]: 2,  // Second preference
    [tueEveningAirport.id]: 1,   // First preference
    [wedOvernightDowntown.id]: 3 // Third preference
  });
  
  johnson.setOvertimePreferences({
    [tueMorningDowntown.id]: 1,  // First preference
    [wedOvernightDowntown.id]: 2 // Second preference
  });
  
  davis.setOvertimePreferences({
    [tueMorningDowntown.id]: 1,  // First preference
    [tueEveningAirport.id]: 2,   // Second preference
    [wedOvernightDowntown.id]: 3 // Third preference
  });
  
  wilson.setOvertimePreferences({
    [tueMorningDowntown.id]: 1,  // First preference
    [tueEveningAirport.id]: 2    // Second preference (but unavailable due to class)
  });
  
  // Martinez doesn't want overtime (on vacation)
  martinez.wantsOvertime = false;
  
  console.log("STARTING OVERTIME ASSIGNMENT PROCESS");
  console.log("-----------------------------------");
  console.log("Initial monitor hours:");
  scheduler.monitors.forEach(m => console.log(`${m.displayName}: ${m.hoursWorked} hours`));
  console.log("-----------------------------------");
  
  // Process assignments
  const assignedShifts = scheduler.processOvertimeAssignments();
  
  // Generate schedule
  const schedule = scheduler.generateSchedule(assignedShifts);
  
  console.log("\nFINAL SCHEDULE:");
  console.log("-----------------------------------");
  console.log("By Location:");
  
  // Print location schedule
  Object.values(schedule.locations).forEach(location => {
    console.log(`\n${location.name}:`);
    location.shifts.forEach(shift => {
      const date = formatDate(shift.date);
      console.log(`  ${date}, ${shift.startTime}-${shift.endTime}: ${shift.monitorName}`);
    });
  });
  
  console.log("\nBy Monitor:");
  // Print monitor schedule
  Object.values(schedule.monitorAssignments).forEach(monitor => {
    console.log(`\n${monitor.name}:`);
    monitor.shifts.forEach(shift => {
      const date = formatDate(shift.date);
      console.log(`  ${shift.locationName}: ${date}, ${shift.startTime}-${shift.endTime}`);
    });
  });
  
  console.log("\nFinal monitor hours:");
  scheduler.monitors.forEach(m => console.log(`${m.displayName}: ${m.hoursWorked} hours`));
}

// Run the demo
runDemo();
