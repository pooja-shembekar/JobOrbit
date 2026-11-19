import mongoose from 'mongoose';
import Job from '../models/Job.js';
import { matchCandidateSkills } from '../services/skillMatching.js';

/* ─── Helpers ────────────────────────────────────────────── */
const formatValidationError = (err) => {
  if (err.name === 'ValidationError') {
    return Object.values(err.errors).map((e) => e.message).join(' ');
  }
  return err.message;
};

/** Parse a comma-separated skills string or passthrough an array */
const parseSkills = (skills) => {
  if (Array.isArray(skills)) return skills.map((s) => s.trim()).filter(Boolean);
  if (typeof skills === 'string' && skills.trim())
    return skills.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

/** Validate and parse salary fields; returns { parsedMin, parsedMax, error } */
const parseSalary = (salaryMin, salaryMax) => {
  const parsedMin = salaryMin !== undefined && salaryMin !== '' && salaryMin !== null
    ? Number(salaryMin) : null;
  const parsedMax = salaryMax !== undefined && salaryMax !== '' && salaryMax !== null
    ? Number(salaryMax) : null;
  if (parsedMin !== null && isNaN(parsedMin))
    return { error: 'Minimum salary must be a valid number.' };
  if (parsedMax !== null && isNaN(parsedMax))
    return { error: 'Maximum salary must be a valid number.' };
  if (parsedMin !== null && parsedMax !== null && parsedMax < parsedMin)
    return { error: 'Maximum salary must be greater than or equal to minimum salary.' };
  return { parsedMin, parsedMax };
};

/* ════════════════════════════════════════════════════════════
   PUBLIC ENDPOINTS (no auth required)
════════════════════════════════════════════════════════════ */

/**
 * @route   GET /api/jobs/public
 * @desc    List open jobs with search, filter, sort, pagination
 * @access  Public
 */
export const getPublicJobs = async (req, res, next) => {
  try {
    const {
      search = '',
      jobType = '',
      experienceLevel = '',
      category = '',
      workMode = '',
      location = '',
      minSalary = '',
      maxSalary = '',
      sort = 'newest',
      page = '1',
      limit = '20',
    } = req.query;

    const query = { status: 'open' };
    const invalidQuery = (message) => Object.assign(new Error(message), { status: 400 });
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (typeof search !== 'string' || search.length > 100) {
      return res.status(400).json({ success: false, message: 'Search must be a string of at most 100 characters.' });
    }
    if (typeof location !== 'string' || location.length > 100) {
      return res.status(400).json({ success: false, message: 'Location must be a string of at most 100 characters.' });
    }

    if (search.trim()) {
      const expression = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { title: expression },
        { company: expression },
        { location: expression },
        { skills: expression },
        { description: expression },
      ];
    }

    const parseFilter = (value, allowed, label) => {
      if (!value) return [];
      if (typeof value !== 'string') throw invalidQuery(`${label} must be a string.`);
      const values = value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
      if (values.length > 10 || values.some((part) => !allowed.includes(part))) {
        throw invalidQuery(`Invalid ${label} filter.`);
      }
      return values;
    };

    const types = parseFilter(jobType, ['full-time', 'part-time', 'contract', 'internship', 'remote', 'freelance'], 'Job type');
    const levels = parseFilter(experienceLevel, ['entry', 'mid', 'senior', 'lead', 'executive'], 'Experience level');
    const categories = parseFilter(category, ['engineering', 'design', 'product', 'data', 'sales', 'marketing', 'customer-support', 'operations', 'finance', 'human-resources', 'other'], 'Category');
    const workModes = parseFilter(workMode, ['remote', 'hybrid', 'onsite'], 'Work mode');
    if (types.length) query.jobType = { $in: types };
    if (levels.length) query.experienceLevel = { $in: levels };
    if (categories.length) query.category = { $in: categories };
    if (workModes.length) query.workMode = { $in: workModes };
    if (location.trim()) query.location = new RegExp(escapeRegex(location.trim()), 'i');

    const parseSalaryFilter = (value, label) => {
      if (value === '') return null;
      if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
        throw invalidQuery(`${label} must be a non-negative amount.`);
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed > 1000000000) {
        throw invalidQuery(`${label} is outside the supported range.`);
      }
      return parsed;
    };
    const minSalaryValue = parseSalaryFilter(minSalary, 'Minimum salary');
    const maxSalaryValue = parseSalaryFilter(maxSalary, 'Maximum salary');
    if (minSalaryValue !== null && maxSalaryValue !== null && minSalaryValue > maxSalaryValue) {
      throw invalidQuery('Minimum salary cannot exceed maximum salary.');
    }
    const salaryConditions = [];
    if (minSalaryValue !== null) {
      salaryConditions.push({
        $or: [
          { salaryMax: { $gte: minSalaryValue } },
          { salaryMax: null, salaryMin: { $gte: minSalaryValue } },
        ],
      });
    }
    if (maxSalaryValue !== null) {
      salaryConditions.push({
        $or: [
          { salaryMin: { $lte: maxSalaryValue } },
          { salaryMin: null, salaryMax: { $lte: maxSalaryValue } },
        ],
      });
    }
    if (salaryConditions.length) query.$and = [...(query.$and || []), ...salaryConditions];

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      title: { title: 1 },
      'salary-asc': { salaryMin: 1, createdAt: -1 },
      'salary-desc': { salaryMax: -1, createdAt: -1 },
    };
    if (typeof sort !== 'string' || !Object.hasOwn(sortMap, sort)) {
      return res.status(400).json({ success: false, message: 'Unsupported sort order.' });
    }

    const parsePositiveInteger = (value, fallback, label, maximum) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        throw invalidQuery(`${label} must be a positive integer.`);
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw invalidQuery(`${label} must be between 1 and ${maximum}.`);
      }
      return parsed;
    };
    const pageNum = parsePositiveInteger(page, 1, 'Page', 1000000);
    const limitNum = parsePositiveInteger(limit, 20, 'Limit', 50);
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(query)
        .select('-__v')
        .sort(sortMap[sort])
        .skip(skip)
        .limit(limitNum)
        .populate('postedBy', 'name')
        .lean(),
      Job.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page:  pageNum,
      pages: Math.ceil(total / limitNum),
      count: jobs.length,
      jobs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum * limitNum < total,
        hasPreviousPage: pageNum > 1,
      },
    });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/**
 * @route   GET /api/jobs/public/:id
 * @desc    Get a single open job by ID
 * @access  Public
 */
export const getPublicJobById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID format.' });
    }

    const job = await Job.findById(req.params.id)
      .select('-__v')
      .populate('postedBy', 'name')
      .lean();

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    return res.status(200).json({ success: true, job });
  } catch (err) {
    next(err);
  }
};

export const matchCandidateToJob = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID format.' });
    }
    const job = await Job.findById(req.params.id).select('skills description').lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const result = await matchCandidateSkills(job.skills, req.user.skills, job.description);
    return res.status(200).json({ success: true, match: result });
  } catch (err) {
    next(err);
  }
};

export const getSavedJobs = async (req, res, next) => {
  try {
    await req.user.populate({
      path: 'savedJobs',
      select: '-__v',
      populate: { path: 'postedBy', select: 'name' },
    });
    return res.status(200).json({ success: true, jobs: req.user.savedJobs });
  } catch (err) {
    next(err);
  }
};

export const saveJob = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID.' });
    }
    const jobExists = await Job.exists({ _id: req.params.id, status: 'open' });
    if (!jobExists) return res.status(404).json({ success: false, message: 'Open job not found.' });

    if (!req.user.savedJobs.some((jobId) => jobId.toString() === req.params.id)) {
      req.user.savedJobs.push(req.params.id);
      await req.user.save();
    }
    return res.status(200).json({ success: true, saved: true });
  } catch (err) {
    next(err);
  }
};

export const removeSavedJob = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID.' });
    }
    req.user.savedJobs.pull(req.params.id);
    await req.user.save();
    return res.status(200).json({ success: true, saved: false });
  } catch (err) {
    next(err);
  }
};

/* ════════════════════════════════════════════════════════════
   RECRUITER-ONLY ENDPOINTS
════════════════════════════════════════════════════════════ */

/**
 * @route   POST /api/jobs
 * @desc    Create a new job listing
 * @access  Private – Recruiter only
 */
export const createJob = async (req, res, next) => {
  try {
    const { title, company, description, location, category, workMode, jobType, experienceLevel,
      salaryMin, salaryMax, skills } = req.body;

    if (!title || !company || !description || !location || !jobType || !experienceLevel) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields: title, company, description, location, job type, and experience level.',
      });
    }

    const salary = parseSalary(salaryMin, salaryMax);
    if (salary.error) return res.status(400).json({ success: false, message: salary.error });

    const job = await Job.create({
      title: title.trim(),
      company: company.trim(),
      description: description.trim(),
      location: location.trim(),
      category: category || 'other',
      workMode: workMode || (jobType === 'remote' ? 'remote' : 'onsite'),
      jobType,
      experienceLevel,
      salaryMin: salary.parsedMin,
      salaryMax: salary.parsedMax,
      skills: parseSkills(skills),
      status: 'open',
      postedBy: req.user._id,
    });

    return res.status(201).json({ success: true, message: 'Job listing created successfully.', job });
  } catch (err) {
    if (err.name === 'ValidationError')
      return res.status(400).json({ success: false, message: formatValidationError(err) });
    next(err);
  }
};

/**
 * @route   GET /api/jobs/my-jobs
 * @desc    Get all jobs created by the logged-in recruiter
 * @access  Private – Recruiter only
 */
export const getMyJobs = async (req, res, next) => {
  try {
    const jobs = await Job.find({ postedBy: req.user._id })
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, count: jobs.length, jobs });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/jobs/:id
 * @desc    Update a job listing (owner only)
 * @access  Private – Recruiter only
 */
export const updateJob = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job listing not found.' });
    if (job.postedBy.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'You are not authorised to edit this job listing.' });

    const { title, company, description, location, category, workMode, jobType, experienceLevel,
      salaryMin, salaryMax, skills, status } = req.body;

    const salary = parseSalary(
      salaryMin !== undefined ? salaryMin : job.salaryMin,
      salaryMax !== undefined ? salaryMax : job.salaryMax
    );
    if (salary.error) return res.status(400).json({ success: false, message: salary.error });

    if (title !== undefined)           job.title           = title.trim();
    if (company !== undefined)         job.company         = company.trim();
    if (description !== undefined)     job.description     = description.trim();
    if (location !== undefined)        job.location        = location.trim();
    if (category !== undefined)         job.category        = category;
    if (workMode !== undefined)         job.workMode        = workMode;
    if (jobType !== undefined)         job.jobType         = jobType;
    if (experienceLevel !== undefined) job.experienceLevel = experienceLevel;
    if (salaryMin !== undefined)       job.salaryMin       = salary.parsedMin;
    if (salaryMax !== undefined)       job.salaryMax       = salary.parsedMax;
    if (skills !== undefined)          job.skills          = parseSkills(skills);
    if (status !== undefined)          job.status          = status;

    await job.save();

    return res.status(200).json({ success: true, message: 'Job listing updated successfully.', job });
  } catch (err) {
    if (err.name === 'ValidationError')
      return res.status(400).json({ success: false, message: formatValidationError(err) });
    next(err);
  }
};

/**
 * @route   PATCH /api/jobs/:id/close
 * @desc    Close a job listing
 * @access  Private – Recruiter only
 */
export const closeJob = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job listing not found.' });
    if (job.postedBy.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'You are not authorised to close this job listing.' });
    if (job.status === 'closed')
      return res.status(400).json({ success: false, message: 'This job listing is already closed.' });

    job.status = 'closed';
    await job.save();

    return res.status(200).json({ success: true, message: 'Job listing closed successfully.', job });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/jobs/:id
 * @desc    Permanently delete a job listing
 * @access  Private – Recruiter only
 */
export const deleteJob = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job listing not found.' });
    if (job.postedBy.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'You are not authorised to delete this job listing.' });

    await job.deleteOne();

    return res.status(200).json({ success: true, message: 'Job listing deleted permanently.' });
  } catch (err) {
    next(err);
  }
};
