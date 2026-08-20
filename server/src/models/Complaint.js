const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: [true, 'Complaint subject is required'],
      trim: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      default: null,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    priority: {
      type: String,
      required: [true, 'Complaint priority is required'],
      enum: {
        values: ['low', 'medium', 'high'],
        message: '{VALUE} is not a valid complaint priority',
      },
    },
    status: {
      type: String,
      required: [true, 'Complaint status is required'],
      enum: {
        values: ['open', 'in-progress', 'resolved'],
        message: '{VALUE} is not a valid complaint status',
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

complaintSchema.index({ unit: 1 });
complaintSchema.index({ building: 1 });
complaintSchema.index({ status: 1 });

const Complaint = mongoose.model('Complaint', complaintSchema);

module.exports = Complaint;
