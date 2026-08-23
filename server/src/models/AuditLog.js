const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: String,
      required: [true, 'Actor ID is required'],
    },
    actorName: {
      type: String,
      default: '',
      trim: true,
    },
    actorRole: {
      type: String,
      enum: {
        values: ['admin', 'staff', 'resident'],
        message: '{VALUE} is not a valid actor role',
      },
      required: [true, 'Actor role is required'],
    },
    action: {
      type: String,
      enum: {
        values: ['created', 'updated', 'deleted'],
        message: '{VALUE} is not a valid audit action',
      },
      required: [true, 'Audit action is required'],
    },
    module: {
      type: String,
      required: [true, 'Audit module is required'],
      trim: true,
    },
    resourceId: {
      type: String,
      default: '',
    },
    resourceLabel: {
      type: String,
      default: '',
      trim: true,
    },
    buildingId: {
      type: String,
      default: null,
    },
    buildingName: {
      type: String,
      default: '',
      trim: true,
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

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ buildingId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
