import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: [true, 'Job reference is required'],
      index: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Candidate reference is required'],
      index: true,
    },
    // Captured at submission time so records remain readable even if user data changes
    candidateName: {
      type: String,
      required: [true, 'Candidate name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    candidateEmail: {
      type: String,
      required: [true, 'Candidate email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone cannot exceed 30 characters'],
      default: '',
    },
    resumeUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'Resume URL cannot exceed 500 characters'],
      default: '',
    },
    resumeFileName: {
      type: String,
      trim: true,
      maxlength: [255, 'Resume filename cannot exceed 255 characters'],
      default: '',
    },
    resumeStorageKey: {
      type: String,
      select: false,
      default: '',
    },
    resumeData: {
      type: Buffer,
      select: false,
    },
    resumeContentType: {
      type: String,
      enum: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    },
    resumeStoredInDatabase: {
      type: Boolean,
      default: false,
    },
    coverLetter: {
      type: String,
      trim: true,
      maxlength: [3000, 'Cover letter cannot exceed 3000 characters'],
      default: '',
    },
    relevantExperience: {
      type: String,
      trim: true,
      maxlength: [2000, 'Relevant experience cannot exceed 2000 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['Submitted', 'Applied', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired'],
        message: '{VALUE} is not a valid application status',
      },
      default: 'Submitted',
    },
    statusHistory: [{
      status: {
        type: String,
        enum: ['Submitted', 'Applied', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired'],
        required: true,
      },
      changedAt: { type: Date, required: true },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      actorRole: { type: String, enum: ['candidate', 'recruiter', 'legacy'], required: true },
    }],
    interview: {
      scheduledAt: { type: Date, default: null },
      meetingDetails: { type: String, trim: true, maxlength: 1000, default: '' },
      status: { type: String, enum: ['scheduled', 'cancelled'] },
      updatedAt: { type: Date, default: null },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      cancelledAt: { type: Date, default: null },
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    consentGiven: {
      type: Boolean,
      required: [true, 'Consent is required'],
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate applications from same candidate for same job
applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });

delete mongoose.models.Application;
const Application = mongoose.model('Application', applicationSchema);

export default Application;
