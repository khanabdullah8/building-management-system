const mongoose = require('mongoose');

const parkingSchema = new mongoose.Schema(
  {
    slotCode: {
      type: String,
      required: [true, 'Slot code is required'],
      trim: true,
      uppercase: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: [true, 'Building reference is required'],
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      default: null,
    },
    vehicleType: {
      type: String,
      enum: {
        values: ['car', 'bike'],
        message: '{VALUE} is not a valid vehicle type',
      },
      default: 'car',
    },
    vehicleNumber: {
      type: String,
      trim: true,
      default: '',
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

parkingSchema.index({ building: 1, slotCode: 1 }, { unique: true });
parkingSchema.index({ building: 1 });
parkingSchema.index({ unit: 1 });

const Parking = mongoose.model('Parking', parkingSchema);

module.exports = Parking;
