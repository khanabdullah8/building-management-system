const mongoose = require('mongoose');

const residentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Resident name is required'],
      trim: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'Unit reference is required'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      required: [true, 'Resident type is required'],
      enum: {
        values: ['owner', 'tenant'],
        message: '{VALUE} is not a valid resident type',
      },
    },
    status: {
      type: String,
      required: [true, 'Resident status is required'],
      enum: {
        values: ['active', 'inactive'],
        message: '{VALUE} is not a valid resident status',
      },
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

residentSchema.index({ unit: 1 });
residentSchema.index({ status: 1 });

const Resident = mongoose.model('Resident', residentSchema);

module.exports = Resident;
