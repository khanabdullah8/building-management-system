const mongoose = require('mongoose');

function generatePaymentNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PAY-${dateStr}-${rand}`;
}

const paymentSchema = new mongoose.Schema(
  {
    paymentNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: generatePaymentNo,
    },
    bill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bill',
      required: [true, 'Bill reference is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    method: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['cash', 'bank_transfer', 'upi', 'card', 'cheque'],
        message: '{VALUE} is not a valid payment method',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['completed', 'pending', 'failed'],
        message: '{VALUE} is not a valid payment status',
      },
      default: 'completed',
    },
    reference: {
      type: String,
      trim: true,
      default: '',
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
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

paymentSchema.index({ bill: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ method: 1 });
paymentSchema.index({ paidAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
