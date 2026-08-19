const mongoose = require('mongoose');

function generateBillNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BILL-${dateStr}-${rand}`;
}

const billSchema = new mongoose.Schema(
  {
    billNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: generateBillNo,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'Unit reference is required'],
    },
    period: {
      type: String,
      required: [true, 'Billing period is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'paid', 'overdue'],
        message: '{VALUE} is not a valid bill status',
      },
      default: 'pending',
    },
    dueDate: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
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

billSchema.index({ unit: 1 });
billSchema.index({ status: 1 });

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;
