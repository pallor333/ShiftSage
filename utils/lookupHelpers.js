/* TABLE LOOKUP HELPER FUNCTIONS ****************************************************************/
// Pre-index monitors by shift _id for O(1) lookup via monitorByShiftId.get()
function monitorLookupByShiftIdTable(monitors){
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
// Pre-index locations by location _id for quick lookup
function locationLookupByLocationIdTable(locations){
  const locationById = new Map() // location_id: {location Object}
  locations.forEach(location => { 
      locationById.set(location._id.toString(), location);
  })
  return locationById
}
// Pre-index monitors by monitor _id for O(1) lookup
function monitorLookupByMonitorIdTable(monitors){
  const monitorByMonitorId = new Map()
  monitors.forEach(monitor => { // monitor_id: {monitor object}
      monitorByMonitorId.set(monitor._id.toString(), monitor); // monitorID is key
  })
  return monitorByMonitorId
}
function openShiftLookupByOpenShiftIdTable(openShifts){
  const openShiftByopenShiftId = new Map()
  openShifts.forEach(shift => { // openShift_id: {openShift object}
      openShiftByopenShiftId.set(shift._id.toString(), shift); // monitorID is key
  })
  return openShiftByopenShiftId
}



module.exports = { locationLookupByLocationIdTable, monitorLookupByShiftIdTable, monitorLookupByMonitorIdTable, openShiftLookupByOpenShiftIdTable }