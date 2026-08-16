const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema(
  {
    unitNumber: {
      type: String,
      required: [true, 'Unit number is required'],
      uppercase: true,
      trim: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: [true, 'Building reference is required'],
    },
    type: {
      type: String,
      trim: true,
      default: '2BHK',
    },
    floor: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: {
        values: ['occupied', 'vacant'],
        message: '{VALUE} is not a valid status',
      },
      default: 'vacant',
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

unitSchema.index({ building: 1, unitNumber: 1 }, { unique: true });
unitSchema.index({ status: 1 });

const Unit = mongoose.model('Unit', unitSchema);

module.exports = Unit;
