const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Maintenance title is required'],
      trim: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'Unit reference is required'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    priority: {
      type: String,
      required: [true, 'Maintenance priority is required'],
      enum: {
        values: ['low', 'medium', 'high'],
        message: '{VALUE} is not a valid maintenance priority',
      },
    },
    assignedTo: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      required: [true, 'Maintenance status is required'],
      enum: {
        values: ['open', 'in-progress', 'completed'],
        message: '{VALUE} is not a valid maintenance status',
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

maintenanceSchema.index({ unit: 1 });
maintenanceSchema.index({ status: 1 });

const Maintenance = mongoose.model('Maintenance', maintenanceSchema);

module.exports = Maintenance;
