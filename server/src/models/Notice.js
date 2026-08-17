const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notice title is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Notice category is required'],
      enum: {
        values: ['notice', 'announcement', 'event'],
        message: '{VALUE} is not a valid notice category',
      },
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
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

noticeSchema.index({ building: 1 });
noticeSchema.index({ publishedAt: -1 });

const Notice = mongoose.model('Notice', noticeSchema);

module.exports = Notice;
