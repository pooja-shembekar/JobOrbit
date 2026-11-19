import path from 'node:path';
import mongoose from 'mongoose';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import { deleteResume, getStoredResume, saveResume } from '../services/resumeStorage.js';
import {
  notifyApplicationStatus,
  notifyApplicationSubmitted,
  notifyInterviewScheduled,
} from '../services/emailNotifications.js';

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const isValidEmail = (value) => typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value.trim());
const isValidPhone = (value) => {
  const normalized = value.replace(/[\s-]/g, '');
  return /^(?:\+91)?[6-9]\d{9}$/.test(normalized);
};
const applicationStatuses = ['Applied', 'Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired'];
const normalizeStatus = (status) => status === 'Submitted' ? 'Applied' : status;
const allowedTransitions = {
  Applied: ['Under Review', 'Shortlisted', 'Rejected'],
  'Under Review': ['Shortlisted', 'Rejected', 'Hired'],
  Shortlisted: ['Rejected', 'Hired'],
  Interview: ['Rejected', 'Hired'],
  Rejected: ['Under Review', 'Shortlisted'],
  Hired: [],
};

const getStatusHistory = (application) => {
  return [...(application.statusHistory || [])].sort(
    (left, right) => new Date(left.changedAt).getTime() - new Date(right.changedAt).getTime()
  );
};

const getResumeContentType = (contentType, filename) => {
  if ([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(contentType)) return contentType;

  const extension = filename?.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
};

const toApplicationResponse = async (application) => {
  const result = application.toObject ? application.toObject() : { ...application };
  result.statusHistory = getStatusHistory(result);
  if (['Rejected', 'Hired'].includes(normalizeStatus(result.status))
    && result.interview?.scheduledAt
    && new Date(result.interview.scheduledAt).getTime() > Date.now()) {
    result.interview.status = 'cancelled';
  }
  const storageKey = result.resumeStorageKey;
  delete result.resumeStorageKey;
  delete result.resumeData;
  const resumeContentType = getResumeContentType(result.resumeContentType, result.resumeFileName);
  result.resumePreviewSupported = Boolean(resumeContentType);
  result.resumePreviewType = resumeContentType === 'application/pdf'
    ? 'pdf'
    : resumeContentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ? 'docx'
      : null;
  delete result.resumeContentType;
  if (result.resumeStoredInDatabase || storageKey) {
    result.resumeDownloadPath = `/applications/${result._id}/resume`;
  }
  delete result.resumeStoredInDatabase;
  return result;
};

const addResumeLinks = async (applications) => Promise.all(
  applications.map((application) => toApplicationResponse(application))
);

const validateResumeContent = (file) => {
  if (!file) return true;
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return file.buffer[0] === 0x50 && file.buffer[1] === 0x4b
      && file.buffer[2] === 0x03 && file.buffer[3] === 0x04;
  }
  return false;
};

export const submitApplication = async (req, res, next) => {
  let resumeStorageKey = '';
  let applicationSaved = false;

  try {
    const { jobId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID.' });
    }

    const job = await Job.findById(jobId).populate('postedBy', 'email').lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.status !== 'open') {
      return res.status(400).json({ success: false, message: 'This job is no longer accepting applications.' });
    }

    const { phone, resumeUrl, coverLetter, relevantExperience, consentGiven } = req.body;
    const textValues = [phone, resumeUrl, coverLetter, relevantExperience];
    if (textValues.some((value) => value !== undefined && typeof value !== 'string')) {
      return res.status(400).json({ success: false, message: 'Application text fields must be strings.' });
    }
    if (!req.user.email?.trim()) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    if (!isValidEmail(req.user.email)) {
      return res.status(400).json({ success: false, message: 'Email address format is invalid.' });
    }

    const hasConsent = consentGiven === true || consentGiven === 'true';
    if (!hasConsent) {
      return res.status(400).json({ success: false, message: 'You must confirm that the submitted information is accurate.' });
    }

    const normalizedPhone = phone?.trim() || '';
    const normalizedResumeUrl = resumeUrl?.trim() || '';
    const normalizedCoverLetter = coverLetter?.trim() || '';
    const normalizedExperience = relevantExperience?.trim() || '';
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    if (!isValidPhone(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid Indian mobile number with 10 digits, optionally prefixed by +91.',
      });
    }
    if (normalizedResumeUrl && !isValidUrl(normalizedResumeUrl)) {
      return res.status(400).json({ success: false, message: 'Resume URL must use HTTP or HTTPS.' });
    }
    if (!req.file && !normalizedResumeUrl) {
      return res.status(400).json({ success: false, message: 'Provide a valid resume/portfolio URL or upload a resume.' });
    }
    if (req.file && normalizedResumeUrl) {
      return res.status(400).json({ success: false, message: 'Provide either a resume upload or a resume URL, not both.' });
    }
    if (req.file && !validateResumeContent(req.file)) {
      return res.status(400).json({ success: false, message: 'Resume file content does not match its declared type.' });
    }
    if (!normalizedCoverLetter) {
      return res.status(400).json({ success: false, message: 'Cover letter is required.' });
    }
    if (normalizedCoverLetter.length > 3000) {
      return res.status(400).json({ success: false, message: 'Cover letter cannot exceed 3000 characters.' });
    }
    if (!normalizedExperience) {
      return res.status(400).json({ success: false, message: 'Relevant experience is required.' });
    }
    if (normalizedExperience.length > 2000) {
      return res.status(400).json({ success: false, message: 'Relevant experience cannot exceed 2000 characters.' });
    }

    const candidateId = req.user._id;
    const existing = await Application.findOne({ job: jobId, candidate: candidateId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already applied for this job.' });
    }

    const storedResume = req.file ? await saveResume(req.file, candidateId) : null;
    resumeStorageKey = storedResume?.storageKey || '';

    const application = await Application.create({
      job: jobId,
      candidate: candidateId,
      candidateName: req.user.name,
      candidateEmail: req.user.email,
      phone: normalizedPhone,
      resumeUrl: normalizedResumeUrl,
      resumeFileName: req.file ? path.basename(req.file.originalname.replace(/\\/g, '/')).slice(0, 255) : '',
      resumeStorageKey,
      resumeData: storedResume?.data,
      resumeContentType: storedResume?.contentType,
      resumeStoredInDatabase: storedResume?.storedInDatabase || false,
      coverLetter: normalizedCoverLetter,
      relevantExperience: normalizedExperience,
      consentGiven: true,
      status: 'Applied',
      statusHistory: [{
        status: 'Applied',
        changedAt: new Date(),
        changedBy: candidateId,
        actorRole: 'candidate',
      }],
    });
    applicationSaved = true;

    await application.populate('job', 'title company');
    const responseApplication = await toApplicationResponse(application);
    void notifyApplicationSubmitted({
      ...responseApplication,
      job: { ...responseApplication.job, recruiterEmail: job.postedBy?.email },
    });

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully! Thank you for applying. Our recruitment team will review your application and contact you if your profile matches the role.',
      application: responseApplication,
    });
  } catch (err) {
    if (resumeStorageKey && !applicationSaved) {
      void deleteResume(resumeStorageKey).catch((cleanupError) => {
        console.error('[Resume] Upload cleanup failed.');
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'You have already applied for this job.' });
    }
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map((error) => error.message).join(' ');
      return res.status(400).json({ success: false, message });
    }
    next(err);
  }
};

export const downloadApplicationResume = async (req, res, next) => {
  try {
    const { id } = req.params;
    const disposition = req.query.disposition || 'attachment';
    if (!['inline', 'attachment'].includes(disposition)) {
      return res.status(400).json({ success: false, message: 'Resume disposition must be inline or attachment.' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid application ID.' });
    }

    const application = await Application.findById(id)
      .select('+resumeData +resumeStorageKey')
      .populate('job', 'postedBy');
    if (!application || !application.job) {
      return res.status(404).json({ success: false, message: 'Resume not found.' });
    }

    const isCandidateOwner = req.user.role === 'candidate'
      && application.candidate.toString() === req.user._id.toString();
    const isRecruiterOwner = req.user.role === 'recruiter'
      && application.job?.postedBy?.toString() === req.user._id.toString();
    if (!isCandidateOwner && !isRecruiterOwner) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this resume.' });
    }

    let resumeData = null;
    if (application.resumeStoredInDatabase) {
      resumeData = application.resumeData || null;
    } else if (application.resumeStorageKey) {
      resumeData = await getStoredResume(application.resumeStorageKey);
    }
    if (!resumeData) {
      return res.status(404).json({ success: false, message: 'Resume file is no longer available.' });
    }

    const contentType = getResumeContentType(application.resumeContentType, application.resumeFileName);
    if (!contentType) {
      return res.status(415).json({ success: false, message: 'This resume file type is not supported for preview or download.' });
    }
    const extension = contentType === 'application/pdf' ? 'pdf' : 'docx';
    const filename = (application.resumeFileName || `resume.${extension}`)
      .replace(/[\r\n\0]/g, '_')
      .replace(/[\\/]/g, '_');
    const fallbackFilename = filename
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_');
    const encodedFilename = encodeURIComponent(filename)
      .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(resumeData);
  } catch (error) {
    next(error);
  }
};

export const getMyApplications = async (req, res, next) => {
  try {
    const applications = await Application.find({ candidate: req.user._id })
      .select('+resumeStorageKey')
      .populate('job', 'title company location jobType status')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: applications.length,
      applications: await addResumeLinks(applications),
    });
  } catch (err) {
    next(err);
  }
};

export const getRecruiterApplications = async (req, res, next) => {
  try {
    const myJobIds = await Job.find({ postedBy: req.user._id }).select('_id').lean();
    const applications = await Application.find({ job: { $in: myJobIds.map((job) => job._id) } })
      .select('+resumeStorageKey')
      .populate('job', 'title company location jobType status')
      .populate({ path: 'candidate', select: '_id', match: { role: 'candidate' } })
      .sort({ createdAt: -1 })
      .lean();
    const validApplications = applications
      .filter((application) => application.candidate)
      .map((application) => ({ ...application, candidate: application.candidate._id }));

    return res.status(200).json({
      success: true,
      count: validApplications.length,
      applications: await addResumeLinks(validApplications),
    });
  } catch (err) {
    next(err);
  }
};

export const updateApplicationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid application ID.' });
    }

    if (!applicationStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${applicationStatuses.join(', ')}.`,
      });
    }

    const application = await Application.findById(id)
      .select('+resumeStorageKey')
      .populate('job', 'postedBy title company location jobType status');
    if (!application || !application.job) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    if (application.job.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You are not authorised to update this application.' });
    }

    const nextStatus = normalizeStatus(status);
    const currentStatus = normalizeStatus(application.status);
    const changed = currentStatus !== nextStatus;
    if (changed && (nextStatus === 'Interview' || !allowedTransitions[currentStatus]?.includes(nextStatus))) {
      return res.status(409).json({
        success: false,
        message: nextStatus === 'Interview'
          ? 'Use interview scheduling to move an application to Interview.'
          : `Application status cannot move from "${currentStatus}" to "${nextStatus}".`,
      });
    }

    if (changed) {
      const changedAt = new Date();
      application.statusHistory = [
        ...getStatusHistory(application.toObject()),
        {
          status: nextStatus,
          changedAt,
          changedBy: req.user._id,
          actorRole: 'recruiter',
        },
      ];
      if (['Rejected', 'Hired'].includes(nextStatus)
        && application.interview?.scheduledAt?.getTime() > changedAt.getTime()
        && application.interview.status !== 'cancelled') {
        application.interview.status = 'cancelled';
        application.interview.cancelledAt = changedAt;
        application.interview.cancelledBy = req.user._id;
      }
    }
    application.status = nextStatus;
    await application.save();
    const responseApplication = await toApplicationResponse(application);
    if (changed) void notifyApplicationStatus(responseApplication);

    return res.status(200).json({
      success: true,
      message: changed ? `Application status updated to "${nextStatus}".` : `Application status remains "${nextStatus}".`,
      application: responseApplication,
    });
  } catch (err) {
    next(err);
  }
};

export const scheduleApplicationInterview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { scheduledAt, meetingDetails = '' } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid application ID.' });
    }
    if (typeof scheduledAt !== 'string' || !Number.isFinite(Date.parse(scheduledAt))) {
      return res.status(400).json({ success: false, message: 'A valid interview date and time are required.' });
    }
    if (Date.parse(scheduledAt) <= Date.now()) {
      return res.status(400).json({ success: false, message: 'Interview date and time must be in the future.' });
    }
    if (typeof meetingDetails !== 'string' || meetingDetails.length > 1000) {
      return res.status(400).json({ success: false, message: 'Meeting details must be a string of at most 1000 characters.' });
    }

    const application = await Application.findById(id)
      .select('+resumeStorageKey')
      .populate('job', 'postedBy title company location jobType status');
    if (!application || !application.job) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    if (application.job.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You are not authorised to schedule this interview.' });
    }
    const currentStatus = normalizeStatus(application.status);
    if (!['Applied', 'Under Review', 'Shortlisted', 'Interview'].includes(currentStatus)) {
      return res.status(409).json({ success: false, message: 'Interview scheduling is not available for the current application status.' });
    }

    const nextScheduledAt = new Date(scheduledAt);
    const normalizedDetails = meetingDetails.trim();
    const changedAt = new Date();
    const changed = application.interview?.scheduledAt?.getTime() !== nextScheduledAt.getTime()
      || (application.interview?.meetingDetails || '') !== normalizedDetails
      || application.interview?.status === 'cancelled';
    application.interview = {
      scheduledAt: nextScheduledAt,
      meetingDetails: normalizedDetails,
      status: 'scheduled',
      updatedAt: changedAt,
      updatedBy: req.user._id,
      cancelledAt: null,
      cancelledBy: null,
    };

    if (currentStatus !== 'Interview') {
      application.status = 'Interview';
      application.statusHistory = [
        ...getStatusHistory(application.toObject()),
        {
          status: 'Interview',
          changedAt,
          changedBy: req.user._id,
          actorRole: 'recruiter',
        },
      ];
    }

    await application.save();
    const responseApplication = await toApplicationResponse(application);
    if (changed) void notifyInterviewScheduled(responseApplication);

    return res.status(200).json({
      success: true,
      message: changed ? 'Interview schedule saved.' : 'Interview schedule is unchanged.',
      application: responseApplication,
    });
  } catch (err) {
    next(err);
  }
};