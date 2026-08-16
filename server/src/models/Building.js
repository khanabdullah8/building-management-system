const mongoose = require('mongoose');

const buildingSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Building code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Building name is required'],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    units: {
      type: Number,
      default: 0,
      min: [0, 'Units count cannot be negative'],
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: '{VALUE} is not a valid status',
      },
      default: 'active',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

buildingSchema.index({ status: 1 });

const Building = mongoose.model('Building', buildingSchema);

module.exports = Building;
