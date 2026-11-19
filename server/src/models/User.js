import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your full name'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\S+@\S+\.\S+$/,
        'Please provide a valid email address format (e.g. user@example.com)',
      ],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      required: [true, 'Please specify an account role'],
      enum: {
        values: ['candidate', 'recruiter'],
        message: '{VALUE} is not a valid role. Role must be candidate or recruiter',
      },
      default: 'candidate',
    },
    skills: {
      type: [{ type: String, trim: true, maxlength: 50 }],
      default: [],
    },
    savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Method to verify candidate password against stored hash
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// Security: Automatically exclude passwordHash and internal version keys whenever user is serialized to JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

userSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

// Prevent re-compiling model if already defined
const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
