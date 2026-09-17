const mongoose = require('mongoose');

const CROP_STATUSES = ['planned', 'sown', 'growing', 'harvested', 'failed'];

const cropSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    variety: { type: String, trim: true, maxlength: 100, default: '' },
    sowingDate: { type: Date },
    expectedHarvestDate: { type: Date },
    status: { type: String, enum: CROP_STATUSES, default: 'planned' },
  },
  { timestamps: true }
);

const farmSchema = new mongoose.Schema(
  {
    // References User.userId (the anonymous client identifier), not a Mongo ObjectId.
    userId: { type: String, required: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    location: {
      name: { type: String, trim: true, maxlength: 150, default: '' },
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },
    areaAcres: { type: Number, min: 0, max: 100000 },
    soilType: { type: String, trim: true, maxlength: 100, default: '' },
    irrigationType: { type: String, trim: true, maxlength: 100, default: '' },
    crops: { type: [cropSchema], default: [] },
  },
  { timestamps: true }
);

farmSchema.index({ userId: 1 });
farmSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Farm', farmSchema);
module.exports.CROP_STATUSES = CROP_STATUSES;
