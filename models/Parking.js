const mongoose = require("mongoose");
const { Schema } = mongoose

// Creating schema for each DB object
const LocationSchema = new Schema({
  name: { type: String, required: true },
  scheduleType: { 
    type: [String], 
    enum: ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"], //enum only allows these values
    lowercase: true, 
    required: true
  },
});

const RegularShiftSchema = new Schema({
  name: { type: String },
  days: [{ 
    type: String, // monday, tuesday, wednesday, thursday, friday,etc
    enum: ["thursday", "friday", "saturday", "sunday", "monday", "tuesday", "wednesday"],  //restricted to these strings
    required: true}], 
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
});

const OpenShiftSchema = new Schema({
  name: { type: String },
  location: { 
    type: Schema.Types.ObjectId, 
    ref: 'Location', 
    required: true
  },
  day: {type: String, required: true },     // monday/tuesday/wednesday, etc
  date: {type: String, required: true},     // MM/DD
  startTime: { type: Date, required: true, },
  endTime: { type: Date, required: true },
  totalHours: {type: Number},
  recurring: { type: Boolean, default: false },
});

const MonitorSchema = new Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true, },
  regularShift: { 
    type: Schema.Types.ObjectId, 
    ref: 'RegularShift'
  },
  location: { 
    type: Schema.Types.ObjectId, 
    ref: 'Location'
  },
  vaca: { type: [Date], default: []}, // Array of Dates, e.g. [new Date("2025-05-01"), new Date("2025-05-15")]
  hours: { type: Schema.Types.Decimal128, required: true, },
  seniority: { type: Date, required: true, },
  //overtimeRankings: { type: Map, of: Number }, // Optional
  lastUpdated: { type: Date, default: () => new Date() }, // Track last update
});

const OvertimeBidsSchema = new Schema({
  monitor: { type: Schema.Types.ObjectId, ref: "Monitor", required: true },
  rankings: [{
    position: { type: Schema.Types.ObjectId, ref: "OpenShift", required: true },
    rank: { type: Number }, // Rank assigned to the position
  }],
  
  // monitorHours: { type: Schema.Types.Decimal128, required: true, },
  // monitorSeniority: {type: Date, required: true},
  //week: { type: Date, default: () => new Date() }, // Timestamp for the week
});

// OvertimeWinnersForScheduleSchema: Sub-document schema for individual monitor entries (e.g., '68264a8179f269ffb0f939f8')
const monitorEntrySchema = new Schema({
  monitorId: { type: Schema.Types.ObjectId, required: true, ref: 'Monitor' },
  monitorName: { type: String, required: true },
  shiftName: { type: String, required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location' }, 
}, { _id: false })
// OvertimeWinnersForScheduleSchema: Sub-document schema for each day (e.g., 'thursday')
const dayScheduleSchema = new Schema({
  locIds: [{ type: Schema.Types.ObjectId, ref: 'Location' }], // Array of ObjectIds
  shifts: {   // Explicitly map OpenShift IDs to their monitor entries
    type: Map,
    of: monitorEntrySchema,
    default: new Map(),
  }
},  { _id: false }); //prevent auto _id creation for sub documents
//Main Schema
const OvertimeWinnersForScheduleSchema = new Schema({
  days: { 
    type: Map,
    of: dayScheduleSchema, //ensure all values match dayScheduleSchema
    default: new Map(), //initialize as empty map
  },
}, { timestamps: true })

const OvertimeWinnersForAuditSchema = new Schema({
  shiftName: { type: String, required: true},
  monitorName: { type: String, required: true},
  hours: { type: Number, required: true},
  monitorsToCharge: { type: Object, default: {} },
}, { timestamps: true })

const WeeklyScheduleSchema = new Schema({
  weekStart: { type: String, required: true},
  weekEnd: { type: String, required: true},
  schedule: { type: String, required: true},
})

const vacationByDaySchema = new Schema({
  day: { type: Date, required: true},
  monitorOffArr: {
    type: [Schema.Types.ObjectId],
    ref: 'Monitor',
    default: []
  }
})

//MongoDB Collection named here - will give lowercase plural of name 
module.exports = {
  Monitor: mongoose.model("Monitor", MonitorSchema),
  RegularShift: mongoose.model("RegularShift", RegularShiftSchema),
  OpenShift: mongoose.model("OpenShift", OpenShiftSchema),
  Location: mongoose.model("Location", LocationSchema),
  OvertimeBid: mongoose.model("OvertimeBid", OvertimeBidsSchema),
  OvertimeSchedule: mongoose.model("OvertimeWinnersForSchedule", OvertimeWinnersForScheduleSchema),
  OvertimeAudit: mongoose.model("OvertimeWinnersForAudit", OvertimeWinnersForAuditSchema),
  VacationLookup: mongoose.model("vacationByDaySchema", vacationByDaySchema),
};


/*
OvertimeBidsSchema.rankings = [
  {
    position: new ObjectId('6826495e9e8667f3047c5613'),
    rank: 1,
    _id: new ObjectId('6848e1addeac5e7d5a875f15')
  },
  {
    position: new ObjectId('68264a8179f269ffb0f939f8'),
    rank: 2,
    _id: new ObjectId('6848e1addeac5e7d5a875f16')
  },
  {
    position: new ObjectId('68264ac779f269ffb0f93a04'),
    rank: 3,
    _id: new ObjectId('6848e1addeac5e7d5a875f17')
  },
  {
    position: new ObjectId('68264add79f269ffb0f93a10'),
    rank: 4,
    _id: new ObjectId('6848e1addeac5e7d5a875f18')
  },
  {
    position: new ObjectId('68264af879f269ffb0f93a1c'),
    rank: 5,
    _id: new ObjectId('6848e1addeac5e7d5a875f19')
  }
]*/