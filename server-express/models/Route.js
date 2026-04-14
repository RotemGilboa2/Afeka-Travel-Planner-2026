const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    city: { type: String, required: true },
    tripType: { type: String, enum: ["bike", "trek"], required: true },
    days: { type: Number, required: true },
    totalDistanceKm: { type: Number, required: true },
    geometry: {
      type: [[Number]],
      required: true,
    },
    daysPlan: [
      {
        dayIndex: { type: Number },
        distanceKm: { type: Number },
      },
    ],
    imageUrl: { type: String },
    aiDescription: { type: String }, 
    userEmail: { type: String, required: true },
  },
  { timestamps: true }
);


module.exports = mongoose.model("Route", routeSchema);