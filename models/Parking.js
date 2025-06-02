const mongoose = require("mongoose");
const { Schema } = mongoose

// Creating schema for each DB object
const LocationSchema = new Schema({
  name: { type: String, required: true },
  scheduleType: { type: String, required: true},
});

const RegularShiftSchema = new Schema({
  name: { type: String },
  days: [{ type: String, required: true}],
  // location: { 
  //   type: Schema.Types.ObjectId, 
  //   ref: 'Location', 
  //   required: true
  // },
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
  day: {type: String, required: true },     // Monday/Tuesday/Wednesday, etc
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
  monitorHours: { type: Schema.Types.Decimal128, required: true, },
  monitorSeniority: {type: Date, required: true},
  //week: { type: Date, default: () => new Date() }, // Timestamp for the week
});

//MongoDB Collection named here - will give lowercase plural of name 
module.exports = {
  Monitor: mongoose.model("Monitor", MonitorSchema),
  RegularShift: mongoose.model("RegularShift", RegularShiftSchema),
  OpenShift: mongoose.model("OpenShift", OpenShiftSchema),
  Location: mongoose.model("Location", LocationSchema),
  OvertimeBid: mongoose.model("OvertimeBid", OvertimeBidsSchema),
};

