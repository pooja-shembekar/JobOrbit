import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      minlength: [3, 'Job title must be at least 3 characters'],
      maxlength: [120, 'Job title cannot exceed 120 characters'],
    },
    company: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      minlength: [2, 'Company name must be at least 2 characters'],
      maxlength: [100, 'Company name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      trim: true,
      minlength: [30, 'Description must be at least 30 characters'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    location: {
      type: String,
      required: [true, 'Job location is required'],
      trim: true,
      maxlength: [120, 'Location cannot exceed 120 characters'],
    },
    category: {
      type: String,
      enum: ['engineering', 'design', 'product', 'data', 'sales', 'marketing', 'customer-support', 'operations', 'finance', 'human-resources', 'other'],
      default: 'other',
      index: true,
    },
    workMode: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite'],
      default: 'onsite',
      index: true,
    },
    jobType: {
      type: String,
      required: [true, 'Job type is required'],
      enum: {
        values: ['full-time', 'part-time', 'contract', 'internship', 'remote', 'freelance'],
        message: '{VALUE} is not a valid job type',
      },
    },
    experienceLevel: {
      type: String,
      required: [true, 'Experience level is required'],
      enum: {
        values: ['entry', 'mid', 'senior', 'lead', 'executive'],
        message: '{VALUE} is not a valid experience level',
      },
    },
    // Salary values are stored as numeric INR amounts without currency conversion.
    salaryMin: {
      type: Number,
      min: [0, 'Minimum salary cannot be negative'],
      default: null,
    },
    salaryMax: {
      type: Number,
      min: [0, 'Maximum salary cannot be negative'],
      default: null,
    },
    skills: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'closed'],
        message: '{VALUE} is not a valid status',
      },
      default: 'open',
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Job must be associated with a recruiter'],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient public job browsing queries
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ jobType: 1, status: 1 });
jobSchema.index({ category: 1, workMode: 1, status: 1 });
jobSchema.index({ title: 'text', company: 'text', skills: 'text' });

// NOTE: Pre-save hooks are intentionally omitted.
// Salary cross-validation and skill sanitisation are handled in the
// controller layer before calling Job.create() / job.save(), to avoid
// the Mongoose/Kareem "next is not a function" bug that occurs when
// node --watch reloads the module and accumulates duplicate hooks on the
// cached model instance.

// Always delete then re-register to prevent hook accumulation on hot-reload
delete mongoose.models.Job;
const Job = mongoose.model('Job', jobSchema);

export default Job;
