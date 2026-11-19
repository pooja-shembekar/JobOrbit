import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import { generateCareerResponse } from '../src/services/careerAssistant.js';

let mongoServer;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'isolated-joborbit-test-secret';
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.S3_BUCKET;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Job.deleteMany({}), Application.deleteMany({})]);
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

let sequence = 0;
const register = async (role = 'candidate') => {
  sequence += 1;
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      name: `${role} User ${sequence}`,
      email: `${role}-${sequence}@example.test`,
      password: 'safe-test-password',
      role,
    });
  assert.equal(response.status, 201, response.body.message);
  const cookie = response.headers['set-cookie'].find((value) => value.startsWith('joborbit_session=')).split(';')[0];
  return { token: cookie.slice('joborbit_session='.length), cookie, user: response.body.user };
};

const jobData = (overrides = {}) => ({
  title: 'Senior React Engineer',
  company: 'Orbit Systems',
  description: 'Build and maintain web applications for a distributed product team.',
  location: 'Seattle, WA',
  jobType: 'full-time',
  experienceLevel: 'senior',
  skills: ['React', 'Node.js'],
  ...overrides,
});

const createJob = async (token, data = jobData()) => {
  const response = await request(app).post('/api/jobs').set('Authorization', `Bearer ${token}`).send(data);
  assert.equal(response.status, 201, response.body.message);
  return response.body.job;
};

const validApplicationData = {
  phone: '+91 98765 43210',
  resumeUrl: 'https://example.test/resume.pdf',
  coverLetter: 'I am interested in this role and bring relevant experience.',
  relevantExperience: 'I have several years of experience building web applications.',
  consentGiven: true,
};

const submitApplication = (token, jobId, body = {}) => request(app)
  .post(`/api/applications/${jobId}`)
  .set('Authorization', `Bearer ${token}`)
  .send({ ...validApplicationData, ...body });

describe('authentication and authorization', () => {
  it('returns JSON for registration validation and malformed JSON errors', async () => {
    const missingFields = await request(app).post('/api/auth/register').send({ email: 'missing@example.test' });
    assert.equal(missingFields.status, 400);
    assert.match(missingFields.headers['content-type'], /application\/json/);
    assert.equal(typeof missingFields.body.message, 'string');

    const malformedJson = await request(app).post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{');
    assert.equal(malformedJson.status, 400);
    assert.match(malformedJson.headers['content-type'], /application\/json/);
    assert.equal(typeof malformedJson.body.message, 'string');
  });

  it('allows recruiter registration without an invitation code and rejects unsupported roles', async () => {
    const recruiter = await register('recruiter');
    assert.equal(recruiter.user.role, 'recruiter');

    const response = await request(app).post('/api/auth/register').send({
      name: 'Invalid Role User',
      email: 'invalid-role@example.test',
      password: 'safe-test-password',
      role: 'administrator',
    });
    assert.equal(response.status, 400);
  });

  it('does not persist a registration when session signing is not configured', async () => {
    const jwtSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Ravi',
        email: 'ravi@example.test',
        password: 'safe-test-password',
      });

      assert.equal(response.status, 503);
      assert.match(response.body.message, /session signing is not configured/i);
      assert.equal(await User.countDocuments({ email: 'ravi@example.test' }), 0);
    } finally {
      process.env.JWT_SECRET = jwtSecret;
    }
  });

  it('resolves concurrent duplicate email registrations through the unique database index', async () => {
    const registration = {
      name: 'Concurrent Candidate',
      email: 'concurrent@example.test',
      password: 'safe-test-password',
    };

    const responses = await Promise.all([
      request(app).post('/api/auth/register').send(registration),
      request(app).post('/api/auth/register').send(registration),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    assert.equal(await User.countDocuments({ email: registration.email }), 1);
  });

  it('supports candidate registration and login with role derived from stored user data', async () => {
    const candidate = await register();
    const login = await request(app).post('/api/auth/login').send({
      email: candidate.user.email,
      password: 'safe-test-password',
      role: 'recruiter',
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'candidate');
    assert.equal(login.body.token, undefined);
    assert.match(login.headers['set-cookie'][0], /HttpOnly/i);

    const currentUser = await request(app).get('/api/auth/me').set('Cookie', candidate.cookie);
    assert.equal(currentUser.status, 200);
    assert.equal(currentUser.body.user.email, candidate.user.email);
    assert.equal(currentUser.body.user.passwordHash, undefined);

    const denied = await request(app).post('/api/jobs').set('Authorization', `Bearer ${candidate.token}`).send(jobData());
    assert.equal(denied.status, 403);
    const recruiterJobsDenied = await request(app).get('/api/jobs/my-jobs')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(recruiterJobsDenied.status, 403);
    const recruiterApplicationsDenied = await request(app).get('/api/applications/recruiter')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(recruiterApplicationsDenied.status, 403);
  });

  it('does not gate existing accounts on a legacy email verification flag', async () => {
    const passwordHash = await bcrypt.hash('safe-test-password', 10);
    await User.collection.insertOne({
      name: 'Legacy Candidate',
      email: 'legacy@example.test',
      passwordHash,
      role: 'candidate',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const login = await request(app).post('/api/auth/login').send({
      email: 'legacy@example.test',
      password: 'safe-test-password',
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.token, undefined);
  });

  it('registers candidates and recruiters without email verification and starts a session', async () => {
    const originalFetch = globalThis.fetch;
    let emailCalls = 0;
    globalThis.fetch = async () => { emailCalls += 1; throw new Error('Email sending should not be called'); };

    try {
      for (const role of ['candidate', 'recruiter']) {
        const response = await request(app).post('/api/auth/register').send({
          name: `${role} Registration`,
          email: `${role}-registration@example.test`,
          password: 'safe-test-password',
          role,
        });
        assert.equal(response.status, 201, response.body.message);
        assert.equal(response.body.user.role, role);
        assert.equal(response.body.verificationRequired, undefined);
        assert.match(response.headers['set-cookie'][0], /HttpOnly/i);
        assert.equal(await bcrypt.compare('safe-test-password', (await User.findOne({ email: response.body.user.email })).passwordHash), true);
        assert.equal((await request(app).get('/api/auth/me').set('Cookie', response.headers['set-cookie'][0])).status, 200);
      }
      assert.equal(emailCalls, 0);
      assert.equal((await request(app).post('/api/auth/verify-email').send({})).status, 404);
      assert.equal((await request(app).post('/api/auth/resend-verification').send({})).status, 404);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects expired or malformed tokens and rejects cookie writes without trusted origin headers', async () => {
    const candidate = await register();
    const malformed = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token');
    assert.equal(malformed.status, 401);
    const expiredToken = jwt.sign({ id: candidate.user._id }, process.env.JWT_SECRET, { expiresIn: -1 });
    const expired = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);
    assert.equal(expired.status, 401);

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const productionLogin = await request(app).post('/api/auth/login').send({
        email: candidate.user.email,
        password: 'safe-test-password',
      });
      assert.equal(productionLogin.status, 200);
      assert.match(productionLogin.headers['set-cookie'][0], /HttpOnly/i);
      assert.match(productionLogin.headers['set-cookie'][0], /Secure/i);
      assert.match(productionLogin.headers['set-cookie'][0], /SameSite=None/i);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }

    const cookieWrite = await request(app).patch('/api/auth/skills')
      .set('Cookie', candidate.cookie)
      .send({ skills: ['React'] });
    assert.equal(cookieWrite.status, 403);

    const allowedCookieWrite = await request(app).patch('/api/auth/skills')
      .set('Cookie', candidate.cookie)
      .set('Origin', 'http://localhost:5173')
      .set('X-Requested-With', 'JobOrbit')
      .send({ skills: ['React'] });
    assert.equal(allowedCookieWrite.status, 200);
  });

  it('returns 401 for protected API calls without a valid token', async () => {
    const response = await request(app).get('/api/applications/my-applications');
    assert.equal(response.status, 401);
  });
});

describe('jobs', () => {
  it('supports recruiter job creation, update, close, and deletion with ownership checks', async () => {
    const recruiter = await register('recruiter');
    const otherRecruiter = await register('recruiter');
    const job = await createJob(recruiter.token, jobData({
      postedBy: otherRecruiter.user._id,
      salaryMin: 300000,
      salaryMax: 600000,
    }));
    assert.equal(job.postedBy.toString(), recruiter.user._id);
    assert.equal(job.salaryMin, 300000);
    assert.equal(job.salaryMax, 600000);
    const storedJob = await Job.findById(job._id).lean();
    assert.equal(storedJob.salaryMin, 300000);
    assert.equal(storedJob.salaryMax, 600000);

    const deniedUpdate = await request(app).put(`/api/jobs/${job._id}`)
      .set('Authorization', `Bearer ${otherRecruiter.token}`).send({ title: 'Other role title' });
    assert.equal(deniedUpdate.status, 403);

    const update = await request(app).put(`/api/jobs/${job._id}`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ title: 'Updated Engineer Role' });
    assert.equal(update.status, 200);
    assert.equal(update.body.job.title, 'Updated Engineer Role');

    const close = await request(app).patch(`/api/jobs/${job._id}/close`)
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(close.status, 200);
    assert.equal(close.body.job.status, 'closed');

    const closedJobs = await request(app).get('/api/jobs/my-jobs')
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(closedJobs.status, 200);
    assert.equal(closedJobs.body.count, 1);
    assert.equal(closedJobs.body.jobs[0].status, 'closed');
    const otherRecruiterJobs = await request(app).get('/api/jobs/my-jobs')
      .set('Authorization', `Bearer ${otherRecruiter.token}`);
    assert.equal(otherRecruiterJobs.body.count, 0);

    const deniedReopen = await request(app).put(`/api/jobs/${job._id}`)
      .set('Authorization', `Bearer ${otherRecruiter.token}`).send({ status: 'open' });
    assert.equal(deniedReopen.status, 403);

    const reopened = await request(app).put(`/api/jobs/${job._id}`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'open' });
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.job.status, 'open');
    const reopenedJobs = await request(app).get('/api/jobs/my-jobs')
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(reopenedJobs.body.jobs[0].status, 'open');

    const remove = await request(app).delete(`/api/jobs/${job._id}`)
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(remove.status, 200);
    assert.equal(await Job.countDocuments({ _id: job._id }), 0);
  });

  it('combines MongoDB search and filters and returns bounded pagination metadata', async () => {
    const recruiter = await register('recruiter');
    await createJob(recruiter.token);
    await createJob(recruiter.token, jobData({
      title: 'Node Platform Engineer',
      location: 'Seattle, WA',
      jobType: 'contract',
      experienceLevel: 'mid',
      skills: ['Node.js'],
    }));
    await createJob(recruiter.token, jobData({
      title: 'React Intern',
      location: 'New York, NY',
      jobType: 'internship',
      experienceLevel: 'entry',
    }));

    const filtered = await request(app).get('/api/jobs/public')
      .query({ search: 'React', location: 'Seattle', jobType: 'full-time', experienceLevel: 'senior' });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.jobs[0].title, 'Senior React Engineer');

    const page = await request(app).get('/api/jobs/public').query({ limit: 1, page: 2, sort: 'oldest' });
    assert.equal(page.status, 200);
    assert.equal(page.body.jobs.length, 1);
    assert.equal(page.body.pagination.page, 2);
    assert.equal(page.body.pagination.limit, 1);
    assert.equal(page.body.pagination.totalPages, 3);
    assert.equal(page.body.pagination.hasPreviousPage, true);

    const literalSearch = await request(app).get('/api/jobs/public').query({ search: '.*' });
    assert.equal(literalSearch.status, 200);
    assert.equal(literalSearch.body.total, 0);
  });

  it('rejects invalid filters and pagination instead of silently changing the query', async () => {
    const invalidFilter = await request(app).get('/api/jobs/public').query({ jobType: 'unknown' });
    const invalidPage = await request(app).get('/api/jobs/public').query({ page: '1.5' });
    assert.equal(invalidFilter.status, 400);
    assert.equal(invalidPage.status, 400);
  });

  it('hides closed jobs from public search and rejects applications until the owner reopens them', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);

    const closed = await request(app).patch(`/api/jobs/${job._id}/close`)
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(closed.status, 200);

    const publicJobs = await request(app).get('/api/jobs/public');
    assert.equal(publicJobs.status, 200);
    assert.equal(publicJobs.body.jobs.some((listedJob) => listedJob._id === job._id), false);

    const application = await submitApplication(candidate.token, job._id);
    assert.equal(application.status, 400);
    assert.match(application.body.message, /no longer accepting applications/i);
    assert.equal(await Application.countDocuments({ job: job._id }), 0);

    const reopened = await request(app).put(`/api/jobs/${job._id}`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'open' });
    assert.equal(reopened.status, 200);
    const accepted = await submitApplication(candidate.token, job._id);
    assert.equal(accepted.status, 201);
  });

  it('searches descriptions and filters category, work mode, and overlapping salary ranges', async () => {
    const recruiter = await register('recruiter');
    await createJob(recruiter.token, jobData({
      title: 'Product Platform Developer',
      description: 'Collaborate with distributed teams to build reliable data products.',
      category: 'engineering',
      workMode: 'hybrid',
      salaryMin: 100000,
      salaryMax: 140000,
    }));
    await createJob(recruiter.token, jobData({
      title: 'Product Platform Analyst',
      description: 'Collaborate with distributed teams to build reliable data products.',
      category: 'data',
      workMode: 'remote',
      salaryMin: 90000,
      salaryMax: 120000,
    }));
    await createJob(recruiter.token, jobData({
      title: 'Senior Platform Developer',
      description: 'Collaborate with distributed teams to build reliable data products.',
      category: 'engineering',
      workMode: 'onsite',
      salaryMin: 160000,
      salaryMax: null,
    }));
    await createJob(recruiter.token, jobData({
      title: 'Data Platform Analyst',
      description: 'Collaborate with distributed teams to build reliable data products.',
      category: 'sales',
      workMode: 'remote',
      salaryMin: null,
      salaryMax: 95000,
    }));

    const filtered = await request(app).get('/api/jobs/public')
      .query({ search: 'distributed teams', category: 'engineering', workMode: 'hybrid', minSalary: 110000, maxSalary: 130000 });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.jobs[0].category, 'engineering');
    assert.equal(filtered.body.jobs[0].workMode, 'hybrid');

    const minimumOnly = await request(app).get('/api/jobs/public').query({ category: 'engineering', minSalary: 150000 });
    assert.equal(minimumOnly.status, 200);
    assert.equal(minimumOnly.body.total, 1);
    assert.equal(minimumOnly.body.jobs[0].title, 'Senior Platform Developer');

    const maximumOnly = await request(app).get('/api/jobs/public').query({ category: 'sales', maxSalary: 95000 });
    assert.equal(maximumOnly.status, 200);
    assert.equal(maximumOnly.body.total, 1);
    assert.equal(maximumOnly.body.jobs[0].title, 'Data Platform Analyst');

    const invalidRange = await request(app).get('/api/jobs/public').query({ minSalary: 150000, maxSalary: 100000 });
    const invalidMode = await request(app).get('/api/jobs/public').query({ workMode: 'flexible' });
    assert.equal(invalidRange.status, 400);
    assert.equal(invalidMode.status, 400);
  });

  it('stores saved jobs per candidate and rejects recruiter access', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const anotherCandidate = await register();
    const job = await createJob(recruiter.token);

    const unauthenticated = await request(app).get('/api/jobs/saved');
    assert.equal(unauthenticated.status, 401);

    const saved = await request(app).post(`/api/jobs/${job._id}/save`)
      .set('Authorization', `Bearer ${candidate.token}`);
    const repeated = await request(app).post(`/api/jobs/${job._id}/save`)
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(saved.status, 200);
    assert.equal(repeated.status, 200);

    const list = await request(app).get('/api/jobs/saved')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.jobs.length, 1);
    assert.equal(list.body.jobs[0]._id, job._id);

    const isolatedList = await request(app).get('/api/jobs/saved')
      .set('Authorization', `Bearer ${anotherCandidate.token}`);
    assert.equal(isolatedList.status, 200);
    assert.equal(isolatedList.body.jobs.length, 0);

    const denied = await request(app).get('/api/jobs/saved')
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(denied.status, 403);
    assert.match(denied.body.message, /role 'recruiter'/);

    const removed = await request(app).delete(`/api/jobs/${job._id}/save`)
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(removed.status, 200);
    const empty = await request(app).get('/api/jobs/saved')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(empty.body.jobs.length, 0);
  });
});

describe('applications', () => {
  it('submits with authenticated candidate identity, prevents duplicates, and isolates candidate reads', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const anotherCandidate = await register();
    const job = await createJob(recruiter.token);
    const roleDenied = await submitApplication(recruiter.token, job._id);
    assert.equal(roleDenied.status, 403);

    const submitted = await submitApplication(candidate.token, job._id, {
      consentGiven: true,
      resumeUrl: 'https://example.test/resume.pdf',
      candidate: anotherCandidate.user._id,
      candidateName: 'Spoofed Name',
      candidateEmail: 'spoofed@example.test',
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.application.candidate.toString(), candidate.user._id);
    assert.equal(submitted.body.application.candidateName, candidate.user.name);
    assert.equal(submitted.body.application.resumeUrl, 'https://example.test/resume.pdf');
    assert.equal(submitted.body.application.status, 'Applied');
    assert.equal(submitted.body.application.statusHistory.length, 1);
    assert.equal(submitted.body.application.statusHistory[0].status, 'Applied');
    assert.equal(submitted.body.application.statusHistory[0].changedBy.toString(), candidate.user._id);
    assert.equal(submitted.body.application.statusHistory[0].actorRole, 'candidate');

    const candidateRead = await request(app).get('/api/applications/my-applications')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(candidateRead.status, 200);
    assert.equal(candidateRead.body.count, 1);
    assert.equal(candidateRead.body.applications[0].candidate.toString(), candidate.user._id);
    assert.equal(candidateRead.body.applications[0].statusHistory.length, 1);

    const candidateRecruiterRead = await request(app).get('/api/applications/recruiter')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(candidateRecruiterRead.status, 403);
    assert.match(candidateRecruiterRead.body.message, /role 'candidate'/);

    const duplicate = await submitApplication(candidate.token, job._id);
    assert.equal(duplicate.status, 409);

    const isolatedRead = await request(app).get('/api/applications/my-applications')
      .set('Authorization', `Bearer ${anotherCandidate.token}`);
    assert.equal(isolatedRead.status, 200);
    assert.equal(isolatedRead.body.count, 0);
  });

  it('omits applications whose candidate account was deleted without deleting the application', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);

    await User.deleteOne({ _id: candidate.user._id });

    const recruiterRead = await request(app).get('/api/applications/recruiter')
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(recruiterRead.status, 200);
    assert.equal(recruiterRead.body.count, 0);
    assert.deepEqual(recruiterRead.body.applications, []);
    assert.equal(await Application.countDocuments({ _id: submitted.body.application._id }), 1);
  });

  it('rejects missing or invalid application fields with field-specific errors', async () => {
    const recruiter = await register('recruiter');
    const job = await createJob(recruiter.token);
    const candidate = await register();

    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(candidate.user._id) }, { $set: { email: '' } });
    const missingEmail = await submitApplication(candidate.token, job._id);
    assert.equal(missingEmail.status, 400);
    assert.match(missingEmail.body.message, /email address is required/i);

    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(candidate.user._id) }, { $set: { email: 'not-an-email' } });
    const invalidEmail = await submitApplication(candidate.token, job._id);
    assert.equal(invalidEmail.status, 400);
    assert.match(invalidEmail.body.message, /email address format is invalid/i);

    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(candidate.user._id) }, { $set: { email: candidate.user.email } });
    const missingPhone = await submitApplication(candidate.token, job._id, { phone: '   ' });
    assert.equal(missingPhone.status, 400);
    assert.match(missingPhone.body.message, /phone number is required/i);

    const invalidPhone = await submitApplication(candidate.token, job._id, { phone: '---()...' });
    assert.equal(invalidPhone.status, 400);
    assert.match(invalidPhone.body.message, /valid indian mobile number with 10 digits/i);

    for (const phone of ['1234567890', '987654321', '+1 98765 43210']) {
      const rejectedPhone = await submitApplication(candidate.token, job._id, { phone });
      assert.equal(rejectedPhone.status, 400);
      assert.match(rejectedPhone.body.message, /valid indian mobile number with 10 digits/i);
    }

    const missingResume = await submitApplication(candidate.token, job._id, { resumeUrl: '' });
    assert.equal(missingResume.status, 400);
    assert.match(missingResume.body.message, /resume\/portfolio URL or upload/i);

    const invalidResumeUrl = await submitApplication(candidate.token, job._id, { resumeUrl: 'javascript:alert(1)' });
    assert.equal(invalidResumeUrl.status, 400);
    assert.match(invalidResumeUrl.body.message, /resume URL must use HTTP or HTTPS/i);

    const missingCoverLetter = await submitApplication(candidate.token, job._id, { coverLetter: '   ' });
    assert.equal(missingCoverLetter.status, 400);
    assert.match(missingCoverLetter.body.message, /cover letter is required/i);

    const missingExperience = await submitApplication(candidate.token, job._id, { relevantExperience: '\n  ' });
    assert.equal(missingExperience.status, 400);
    assert.match(missingExperience.body.message, /relevant experience is required/i);
    assert.equal(await Application.countDocuments({ job: job._id }), 0);
  });

  it('accepts 10-digit Indian mobile numbers with or without the +91 prefix', async () => {
    const recruiter = await register('recruiter');
    const candidateWithPrefix = await register();
    const candidateWithoutPrefix = await register();
    const jobWithPrefix = await createJob(recruiter.token);
    const jobWithoutPrefix = await createJob(recruiter.token);

    const prefixed = await submitApplication(candidateWithPrefix.token, jobWithPrefix._id, {
      phone: '+91 98765 43210',
    });
    const unprefixed = await submitApplication(candidateWithoutPrefix.token, jobWithoutPrefix._id, {
      phone: '9876543210',
    });

    assert.equal(prefixed.status, 201, prefixed.body.message);
    assert.equal(unprefixed.status, 201, unprefixed.body.message);
    assert.equal(prefixed.body.application.phone, '+91 98765 43210');
    assert.equal(unprefixed.body.application.phone, '9876543210');
  });

  it('accepts valid resume URLs and valid uploaded resumes without a URL', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);

    const urlApplication = await submitApplication(candidate.token, job._id);
    assert.equal(urlApplication.status, 201);
    assert.equal(urlApplication.body.application.resumeUrl, validApplicationData.resumeUrl);
    assert.equal(urlApplication.body.application.phone, validApplicationData.phone);
    assert.equal(urlApplication.body.application.coverLetter, validApplicationData.coverLetter);

    const uploadJob = await createJob(recruiter.token, jobData({ title: 'Backend Platform Engineer' }));
    const storedObjects = new Map();
    const storageServer = createServer((req, res) => {
      req.resumeUploadMethod = req.method;
      const key = new URL(req.url, 'http://localhost').pathname.split('/').slice(2).join('/');
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        if (req.method === 'PUT') {
          storedObjects.set(key, Buffer.concat(chunks));
          res.writeHead(200, { ETag: '"resume-test-etag"' });
          res.end();
        } else if (req.method === 'GET' && storedObjects.has(key)) {
          const resume = storedObjects.get(key);
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': resume.length,
          });
          res.end(resume);
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });
    await new Promise((resolve) => storageServer.listen(0, '127.0.0.1', resolve));
    const { port } = storageServer.address();
    process.env.S3_BUCKET = 'joborbit-test';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ENDPOINT = `http://127.0.0.1:${port}`;
    process.env.S3_ACCESS_KEY_ID = 'test-access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
    const uploadedResume = Buffer.from('%PDF-1.4\nvalid test resume');

    try {
      const uploaded = await request(app).post(`/api/applications/${uploadJob._id}`)
        .set('Authorization', `Bearer ${candidate.token}`)
        .field('phone', validApplicationData.phone)
        .field('coverLetter', validApplicationData.coverLetter)
        .field('relevantExperience', validApplicationData.relevantExperience)
        .field('consentGiven', 'true')
        .attach('resume', uploadedResume, { filename: 'Candidate CV.pdf', contentType: 'application/pdf' });
      assert.equal(uploaded.status, 201, uploaded.body.message);
      assert.equal(uploaded.body.application.resumeUrl, '');
      assert.equal(uploaded.body.application.resumeFileName, 'Candidate CV.pdf');
      assert.equal(uploaded.body.application.resumePreviewSupported, true);
      assert.equal(uploaded.body.application.resumeDownloadPath, `/applications/${uploaded.body.application._id}/resume`);
      assert.equal(uploaded.body.application.resumeStorageKey, undefined);
      assert.ok(await Application.exists({ job: uploadJob._id, candidate: candidate.user._id }));

      const recruiterApplications = await request(app).get('/api/applications/recruiter')
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(recruiterApplications.status, 200);
      assert.equal(recruiterApplications.body.applications[0].resumeFileName, 'Candidate CV.pdf');
      assert.equal(recruiterApplications.body.applications[0].resumePreviewSupported, true);
      assert.equal(recruiterApplications.body.applications[0].resumeDownloadPath, uploaded.body.application.resumeDownloadPath);

      const downloaded = await request(app).get(`/api${uploaded.body.application.resumeDownloadPath}`)
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(downloaded.status, 200);
      assert.match(downloaded.headers['content-type'], /application\/pdf/);
      assert.match(downloaded.headers['content-disposition'], /Candidate CV\.pdf/);
      assert.match(downloaded.headers['content-disposition'], /^attachment;/);
      assert.deepEqual(downloaded.body, uploadedResume);

      const viewed = await request(app).get(`/api${uploaded.body.application.resumeDownloadPath}?disposition=inline`)
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(viewed.status, 200);
      assert.match(viewed.headers['content-type'], /application\/pdf/);
      assert.match(viewed.headers['content-disposition'], /^inline;/);
      assert.deepEqual(viewed.body, uploadedResume);

      const unauthorizedCandidate = await register();
      const deniedView = await request(app).get(`/api${uploaded.body.application.resumeDownloadPath}?disposition=inline`)
        .set('Authorization', `Bearer ${unauthorizedCandidate.token}`);
      assert.equal(deniedView.status, 403);
    } finally {
      delete process.env.S3_BUCKET;
      delete process.env.S3_REGION;
      delete process.env.S3_ENDPOINT;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.S3_SECRET_ACCESS_KEY;
      await new Promise((resolve, reject) => storageServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('stores uploads in MongoDB when S3 is unconfigured and restricts resume downloads', async () => {
    const recruiter = await register('recruiter');
    const otherRecruiter = await register('recruiter');
    const candidate = await register();
    const otherCandidate = await register();
    const job = await createJob(recruiter.token);
    const previousBucket = process.env.S3_BUCKET;
    delete process.env.S3_BUCKET;

    try {
      const response = await request(app).post(`/api/applications/${job._id}`)
        .set('Authorization', `Bearer ${candidate.token}`)
        .field('phone', validApplicationData.phone)
        .field('coverLetter', validApplicationData.coverLetter)
        .field('relevantExperience', validApplicationData.relevantExperience)
        .field('consentGiven', 'true')
        .attach('resume', Buffer.from('%PDF-1.4\nvalid test resume'), { filename: 'resume.pdf', contentType: 'application/pdf' });

      assert.equal(response.status, 201, response.body.message);
      assert.equal(response.body.application.resumeUrl, '');
      assert.equal(response.body.application.resumeDownloadPath, `/applications/${response.body.application._id}/resume`);
      assert.equal(response.body.application.resumeFileName, 'resume.pdf');
      assert.equal(response.body.application.resumePreviewSupported, true);
      assert.equal(response.body.application.resumeData, undefined);
      const saved = await Application.findById(response.body.application._id).select('+resumeData');
      assert.equal(saved.resumeData.toString(), '%PDF-1.4\nvalid test resume');

      const downloadPath = `/api${response.body.application.resumeDownloadPath}`;
      const candidateDownload = await request(app).get(downloadPath)
        .set('Authorization', `Bearer ${candidate.token}`);
      assert.equal(candidateDownload.status, 200);
      assert.match(candidateDownload.headers['content-type'], /application\/pdf/);
      assert.match(candidateDownload.headers['content-disposition'], /^attachment;/);
      assert.equal(candidateDownload.body.toString(), '%PDF-1.4\nvalid test resume');

      const recruiterDownload = await request(app).get(downloadPath)
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(recruiterDownload.status, 200);
      assert.match(recruiterDownload.headers['content-disposition'], /resume\.pdf/);
      assert.match(recruiterDownload.headers['content-disposition'], /^attachment;/);
      const recruiterView = await request(app).get(`${downloadPath}?disposition=inline`)
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(recruiterView.status, 200);
      assert.match(recruiterView.headers['content-disposition'], /^inline;/);
      assert.equal(recruiterView.body.toString(), '%PDF-1.4\nvalid test resume');

      const deniedDownload = await request(app).get(downloadPath)
        .set('Authorization', `Bearer ${otherRecruiter.token}`);
      assert.equal(deniedDownload.status, 403);
      const candidateAccessDenied = await request(app).get(downloadPath)
        .set('Authorization', `Bearer ${otherCandidate.token}`);
      assert.equal(candidateAccessDenied.status, 403);

      const docxJob = await createJob(recruiter.token, jobData({ title: 'DOCX Resume Test Role' }));
      const docxApplication = await request(app).post(`/api/applications/${docxJob._id}`)
        .set('Authorization', `Bearer ${candidate.token}`)
        .field('phone', validApplicationData.phone)
        .field('coverLetter', validApplicationData.coverLetter)
        .field('relevantExperience', validApplicationData.relevantExperience)
        .field('consentGiven', 'true')
        .attach('resume', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]), {
          filename: 'candidate.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
      assert.equal(docxApplication.status, 201);
      assert.equal(docxApplication.body.application.resumePreviewSupported, true);
      assert.equal(docxApplication.body.application.resumePreviewType, 'docx');
      const recruiterResumeList = await request(app).get('/api/applications/recruiter')
        .set('Authorization', `Bearer ${recruiter.token}`);
      const listedDocxApplication = recruiterResumeList.body.applications
        .find((application) => application._id === docxApplication.body.application._id);
      assert.equal(listedDocxApplication.resumePreviewType, 'docx');
      const docxInline = await request(app)
        .get(`/api${docxApplication.body.application.resumeDownloadPath}?disposition=inline`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(docxInline.status, 200);
      assert.match(docxInline.headers['content-type'], /wordprocessingml\.document/);
      assert.match(docxInline.headers['content-disposition'], /^inline;/);
      assert.deepEqual(docxInline.body, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]));
      const docxDownload = await request(app)
        .get(`/api${docxApplication.body.application.resumeDownloadPath}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(docxDownload.status, 200);
      assert.match(docxDownload.headers['content-type'], /wordprocessingml\.document/);
      assert.match(docxDownload.headers['content-disposition'], /candidate\.docx/);
      assert.deepEqual(docxDownload.body, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]));

      await Application.updateOne(
        { _id: docxApplication.body.application._id },
        { $unset: { resumeContentType: 1 } }
      );
      const legacyRecruiterList = await request(app).get('/api/applications/recruiter')
        .set('Authorization', `Bearer ${recruiter.token}`);
      const legacyDocxApplication = legacyRecruiterList.body.applications
        .find((application) => application._id === docxApplication.body.application._id);
      assert.equal(legacyDocxApplication.resumePreviewType, 'docx');
      const legacyDocxPreview = await request(app)
        .get(`/api${docxApplication.body.application.resumeDownloadPath}?disposition=inline`)
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(legacyDocxPreview.status, 200);
      assert.match(legacyDocxPreview.headers['content-type'], /wordprocessingml\.document/);

      await Application.updateOne({ _id: response.body.application._id }, { $unset: { resumeData: 1 } });
      const missingDownload = await request(app).get(downloadPath)
        .set('Authorization', `Bearer ${recruiter.token}`);
      assert.equal(missingDownload.status, 404);
      assert.match(missingDownload.body.message, /no longer available/i);
    } finally {
      if (previousBucket === undefined) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = previousBucket;
    }
  });

  it('returns a useful API error when the candidate application query fails', async () => {
    const candidate = await register();
    const originalFind = Application.find;
    const originalConsoleError = console.error;
    const errorLogs = [];
    console.error = (...args) => errorLogs.push(args);
    Application.find = () => {
      throw Object.assign(new Error('Application query unavailable.'), { status: 503 });
    };

    try {
      const response = await request(app).get('/api/applications/my-applications')
        .set('Authorization', `Bearer ${candidate.token}`);
      assert.equal(response.status, 503);
      assert.equal(response.body.success, false);
      assert.equal(response.body.message, 'An unexpected server error occurred.');
      assert.doesNotMatch(response.body.message, /Application query unavailable/);
      assert.equal(errorLogs.length, 1);
      assert.equal(errorLogs[0][0], '[API] Unexpected request failure.');
      assert.deepEqual(errorLogs[0][1], {
        method: 'GET',
        route: '/api/applications/my-applications',
        status: 503,
        errorName: 'Error',
      });
      assert.doesNotMatch(JSON.stringify(errorLogs), /Application query unavailable/);
    } finally {
      Application.find = originalFind;
      console.error = originalConsoleError;
    }
  });

  it('restricts application status updates to the recruiter who owns its job', async () => {
    const recruiter = await register('recruiter');
    const otherRecruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;

    const denied = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${otherRecruiter.token}`).send({ status: 'Shortlisted' });
    assert.equal(denied.status, 403);
    const candidateStatusWrite = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${candidate.token}`).send({ status: 'Shortlisted' });
    assert.equal(candidateStatusWrite.status, 403);
    const unchanged = await Application.findById(applicationId).lean();
    assert.equal(unchanged.status, 'Applied');
    assert.equal(unchanged.statusHistory.length, 1);

    const updated = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Shortlisted' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.application.status, 'Shortlisted');
    assert.equal(updated.body.application.statusHistory.length, 2);
    assert.ok(Date.parse(updated.body.application.statusHistory[1].changedAt) >= Date.now() - 5000);
    assert.equal(updated.body.application.statusHistory[1].changedBy.toString(), recruiter.user._id);
    assert.equal(updated.body.application.statusHistory[1].actorRole, 'recruiter');

    const refreshed = await request(app).get('/api/applications/my-applications')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.applications[0].status, 'Shortlisted');
    assert.deepEqual(refreshed.body.applications[0].statusHistory.map((event) => event.status), ['Applied', 'Shortlisted']);

    const repeated = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Shortlisted' });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.application.statusHistory.length, 2);

    const recruiterList = await request(app).get('/api/applications/recruiter')
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(recruiterList.status, 200);
    assert.equal(recruiterList.body.count, 1);

    const recruiterCandidateRead = await request(app).get('/api/applications/my-applications')
      .set('Authorization', `Bearer ${recruiter.token}`);
    assert.equal(recruiterCandidateRead.status, 403);

    const otherRecruiterList = await request(app).get('/api/applications/recruiter')
      .set('Authorization', `Bearer ${otherRecruiter.token}`);
    assert.equal(otherRecruiterList.status, 200);
    assert.equal(otherRecruiterList.body.count, 0);
  });

  it('sends detailed status emails only after changed status writes and tolerates provider failures', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;
    const originalFetch = globalThis.fetch;
    const emails = [];
    process.env.RESEND_API_KEY = 'test-only-key';
    process.env.EMAIL_FROM = 'JobOrbit <test@example.test>';
    globalThis.fetch = async (url, options) => {
      const payload = JSON.parse(options.body);
      emails.push(payload);
      const stored = await Application.findById(applicationId).lean();
      assert.equal(stored.status, 'Shortlisted');
      return new Response('{}', { status: 200 });
    };

    try {
      const shortlisted = await request(app).patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Shortlisted' });
      assert.equal(shortlisted.status, 200);
      assert.equal(emails.length, 1);
      assert.match(emails[0].text, new RegExp(candidate.user.name));
      assert.match(emails[0].text, /Senior React Engineer/);
      assert.match(emails[0].text, /Orbit Systems/);
      assert.match(emails[0].text, /Shortlisted/);
      assert.match(emails[0].text, /watch your email/i);

      const repeated = await request(app).patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Shortlisted' });
      assert.equal(repeated.status, 200);
      assert.equal(emails.length, 1);

      globalThis.fetch = async () => new Response('provider unavailable', { status: 503 });
      const rejected = await request(app).patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Rejected' });
      assert.equal(rejected.status, 200);
      assert.equal(rejected.body.application.status, 'Rejected');
      assert.equal((await Application.findById(applicationId)).status, 'Rejected');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
    }
  });

  it('does not invent legacy history and records new transitions with their actual actor', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;

    await Application.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(applicationId) },
      { $unset: { statusHistory: '' }, $set: { status: 'Shortlisted' } }
    );

    const legacyRead = await request(app).get('/api/applications/my-applications')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(legacyRead.status, 200);
    assert.deepEqual(legacyRead.body.applications[0].statusHistory, []);

    const beforeChange = Date.now();
    const updated = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Rejected' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.application.status, 'Rejected');
    assert.deepEqual(updated.body.application.statusHistory.map((event) => event.status), ['Rejected']);
    assert.ok(Date.parse(updated.body.application.statusHistory[0].changedAt) >= beforeChange);
    assert.equal(updated.body.application.statusHistory[0].changedBy.toString(), recruiter.user._id);
    assert.equal(updated.body.application.statusHistory[0].actorRole, 'recruiter');
  });

  it('returns recorded status events in chronological order without changing their values', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;
    await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Under Review' });
    await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Shortlisted' });
    const originalHistory = (await Application.findById(applicationId).lean()).statusHistory;
    await Application.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(applicationId) },
      { $set: { statusHistory: [...originalHistory].reverse() } }
    );

    const response = await request(app).get('/api/applications/my-applications')
      .set('Authorization', `Bearer ${candidate.token}`);
    const history = response.body.applications[0].statusHistory;
    assert.deepEqual(history.map((event) => event.status), ['Applied', 'Under Review', 'Shortlisted']);
    assert.deepEqual(history.map((event) => event.changedAt), originalHistory.map((event) => event.changedAt.toISOString()));
    assert.deepEqual(history.map((event) => event.changedBy.toString()), originalHistory.map((event) => event.changedBy.toString()));
  });

  it('allows recruiters to reconsider rejected applications and rejects invalid transitions', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;

    const directInterview = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Interview' });
    assert.equal(directInterview.status, 409);
    assert.equal((await Application.findById(applicationId).lean()).status, 'Applied');

    const rejected = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Rejected' });
    assert.equal(rejected.status, 200);

    for (const status of ['Interview', 'Applied', 'Hired']) {
      const reopened = await request(app).patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({ status });
      assert.equal(reopened.status, 409);
    }
    const shortlisted = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'Shortlisted' });
    assert.equal(shortlisted.status, 200);
    assert.equal(shortlisted.body.application.status, 'Shortlisted');
    assert.deepEqual(
      shortlisted.body.application.statusHistory.map((event) => event.status),
      ['Applied', 'Rejected', 'Shortlisted']
    );
    assert.equal(shortlisted.body.application.statusHistory.at(-1).changedBy.toString(), recruiter.user._id);
    assert.equal(shortlisted.body.application.statusHistory.at(-1).actorRole, 'recruiter');

    const rejectedAgain = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'Rejected' });
    assert.equal(rejectedAgain.status, 200);

    const underReview = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`)
      .send({ status: 'Under Review' });
    assert.equal(underReview.status, 200);
    assert.equal(underReview.body.application.status, 'Under Review');
    assert.deepEqual(
      underReview.body.application.statusHistory.map((event) => event.status),
      ['Applied', 'Rejected', 'Shortlisted', 'Rejected', 'Under Review']
    );
    assert.equal(underReview.body.application.statusHistory.at(-1).changedBy.toString(), recruiter.user._id);
    assert.equal(underReview.body.application.statusHistory.at(-1).actorRole, 'recruiter');
  });

  it('keeps hired applications terminal so rejected transitions stay unavailable', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;

    const underReview = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Under Review' });
    assert.equal(underReview.status, 200);

    const hired = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Hired' });
    assert.equal(hired.status, 200);
    assert.equal(hired.body.application.status, 'Hired');

    for (const status of ['Shortlisted', 'Under Review', 'Interview', 'Applied', 'Rejected']) {
      const rejectedMove = await request(app).patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({ status });
      assert.equal(rejectedMove.status, 409, `expected "${status}" to be rejected`);
      if (status === 'Interview') {
        assert.match(rejectedMove.body.message, /Use interview scheduling/);
      } else {
        assert.match(rejectedMove.body.message, /cannot move from "Hired"/);
      }
    }

    const stored = await Application.findById(applicationId).lean();
    assert.equal(stored.status, 'Hired');
  });

  it('schedules interviews for the owning recruiter and avoids duplicate notifications', async () => {
    const recruiter = await register('recruiter');
    const otherRecruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;
    const originalFetch = globalThis.fetch;
    const emailRequests = [];
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const schedule = { scheduledAt, meetingDetails: 'https://meet.example.test/room' };
    process.env.RESEND_API_KEY = 'test-only-key';
    process.env.EMAIL_FROM = 'JobOrbit <test@example.test>';
    globalThis.fetch = async (url, options) => {
      emailRequests.push(JSON.parse(options.body));
      return new Response('{}', { status: 200 });
    };

    try {
      const saved = await request(app).patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${recruiter.token}`).send(schedule);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.application.status, 'Interview');
      assert.equal(saved.body.application.interview.meetingDetails, schedule.meetingDetails);
      assert.equal(saved.body.application.statusHistory.at(-1).actorRole, 'recruiter');
      assert.equal(saved.body.application.statusHistory.at(-1).changedBy.toString(), recruiter.user._id);
      assert.ok(Date.parse(saved.body.application.statusHistory.at(-1).changedAt) <= Date.now());

      const repeated = await request(app).patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${recruiter.token}`).send(schedule);
      assert.equal(repeated.status, 200);
      assert.equal(emailRequests.length, 1);
      assert.match(emailRequests[0].text, /https:\/\/meet\.example\.test\/room/);

      const denied = await request(app).patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${otherRecruiter.token}`).send({
          scheduledAt: new Date(Date.now() + 172800000).toISOString(),
        });
      assert.equal(denied.status, 403);

      const invalid = await request(app).patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({ scheduledAt: 'not-a-date' });
      assert.equal(invalid.status, 400);

      const hired = await request(app).patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Hired' });
      assert.equal(hired.status, 200);
      assert.equal(hired.body.application.interview.status, 'cancelled');
      const candidateAfterHire = await request(app).get('/api/applications/my-applications')
        .set('Authorization', `Bearer ${candidate.token}`);
      assert.equal(candidateAfterHire.status, 200);
      assert.equal(candidateAfterHire.body.applications[0].status, 'Hired');
      assert.equal(candidateAfterHire.body.applications[0].interview.status, 'cancelled');
      const scheduleAfterHire = await request(app).patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${recruiter.token}`).send({
          scheduledAt: new Date(Date.now() + 172800000).toISOString(),
        });
      assert.equal(scheduleAfterHire.status, 409);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
    }
  });

  it('cancels an upcoming interview on rejection and prevents rescheduling', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();

    const scheduled = await request(app).patch(`/api/applications/${applicationId}/interview`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ scheduledAt });
    assert.equal(scheduled.status, 200);
    assert.equal(scheduled.body.application.status, 'Interview');
    assert.equal(scheduled.body.application.interview.status, 'scheduled');

    const beforeRejection = Date.now();
    const rejected = await request(app).patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({ status: 'Rejected' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.application.interview.status, 'cancelled');
    assert.equal(rejected.body.application.interview.cancelledBy.toString(), recruiter.user._id);
    assert.ok(Date.parse(rejected.body.application.interview.cancelledAt) >= beforeRejection);
    assert.equal(rejected.body.application.statusHistory.at(-1).status, 'Rejected');
    assert.equal(rejected.body.application.statusHistory.at(-1).changedBy.toString(), recruiter.user._id);

    const reschedule = await request(app).patch(`/api/applications/${applicationId}/interview`)
      .set('Authorization', `Bearer ${recruiter.token}`).send({
        scheduledAt: new Date(Date.now() + 172800000).toISOString(),
      });
    assert.equal(reschedule.status, 409);

    const persisted = await Application.findById(applicationId).lean();
    assert.equal(persisted.status, 'Rejected');
    assert.equal(persisted.interview.status, 'cancelled');
  });

  it('reports legacy upcoming interviews as cancelled for terminal applications without migrating records', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const submitted = await submitApplication(candidate.token, job._id);
    const applicationId = submitted.body.application._id;
    const scheduledAt = new Date(Date.now() + 86400000);
    await Application.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(applicationId) },
      { $set: { status: 'Rejected', 'interview.scheduledAt': scheduledAt } }
    );

    const response = await request(app).get('/api/applications/my-applications')
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(response.body.applications[0].interview.status, 'cancelled');
    const stored = await Application.collection.findOne({ _id: new mongoose.Types.ObjectId(applicationId) });
    assert.equal(stored.interview.status, undefined);
    assert.equal(stored.interview.scheduledAt.getTime(), scheduledAt.getTime());
  });

  it('rejects unsupported resume file types before creating an application', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const response = await request(app).post(`/api/applications/${job._id}`)
      .set('Authorization', `Bearer ${candidate.token}`)
      .field('consentGiven', 'true')
      .attach('resume', Buffer.from('not a resume'), { filename: 'payload.exe', contentType: 'application/octet-stream' });
    assert.equal(response.status, 400);
    assert.equal(await Application.countDocuments({ job: job._id }), 0);

    const invalidContent = await request(app).post(`/api/applications/${job._id}`)
      .set('Authorization', `Bearer ${candidate.token}`)
      .field('consentGiven', 'true')
      .attach('resume', Buffer.from('not a PDF'), { filename: 'resume.pdf', contentType: 'application/pdf' });
    assert.equal(invalidContent.status, 400);
    assert.equal(await Application.countDocuments({ job: job._id }), 0);
  });

  it('does not fail a committed application when the email provider fails', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    const originalFetch = globalThis.fetch;
    const notifiedAddresses = [];
    process.env.RESEND_API_KEY = 'test-only-key';
    process.env.EMAIL_FROM = 'JobOrbit <test@example.test>';
    globalThis.fetch = async (url, options) => {
      notifiedAddresses.push(JSON.parse(options.body).to[0]);
      return new Response('provider unavailable', { status: 503 });
    };

    try {
      const response = await submitApplication(candidate.token, job._id);
      assert.equal(response.status, 201);
      assert.equal(await Application.countDocuments({ job: job._id }), 1);
      assert.deepEqual(new Set(notifiedAddresses), new Set([candidate.user.email, recruiter.user.email]));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
    }
  });
});

describe('candidate skill matching', () => {
  it('saves candidate skills and returns a labelled deterministic overlap without provider credentials', async () => {
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token, jobData({ skills: ['React', 'Node.js'] }));

    const saved = await request(app).patch('/api/auth/skills')
      .set('Authorization', `Bearer ${candidate.token}`).send({ skills: ['React', 'TypeScript'] });
    assert.equal(saved.status, 200);

    const match = await request(app).post(`/api/jobs/${job._id}/match`)
      .set('Authorization', `Bearer ${candidate.token}`);
    assert.equal(match.status, 200);
    assert.equal(match.body.match.method, 'deterministic');
    assert.equal(match.body.match.score, 50);
    assert.deepEqual(match.body.match.matchedSkills, ['React']);
  });

  it('falls back deterministically when the optional AI provider fails', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    await request(app).patch('/api/auth/skills')
      .set('Authorization', `Bearer ${candidate.token}`).send({ skills: ['React'] });

    const originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-only-key';
    process.env.AI_MODEL = 'test-model';
    globalThis.fetch = async () => new Response('provider unavailable', { status: 503 });
    try {
      const match = await request(app).post(`/api/jobs/${job._id}/match`)
        .set('Authorization', `Bearer ${candidate.token}`);
      assert.equal(match.status, 200);
      assert.equal(match.body.match.method, 'deterministic');
      assert.match(match.body.match.notice, /AI matching was unavailable/);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.AI_API_KEY;
      delete process.env.AI_MODEL;
    }
  });

  it('uses only profile-grounded AI skill pairs and derives the score on the server', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token, jobData({ skills: ['React', 'Node.js'] }));
    await request(app).patch('/api/auth/skills')
      .set('Authorization', `Bearer ${candidate.token}`).send({ skills: ['ReactJS'] });

    const originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-only-key';
    process.env.AI_MODEL = 'test-model';
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ matches: [{ jobSkill: 'React', candidateSkill: 'ReactJS' }] }) } }],
    }), { status: 200 });
    try {
      const match = await request(app).post(`/api/jobs/${job._id}/match`)
        .set('Authorization', `Bearer ${candidate.token}`);
      assert.equal(match.status, 200);
      assert.equal(match.body.match.method, 'ai');
      assert.equal(match.body.match.score, 50);
      assert.deepEqual(match.body.match.matchedSkills, ['React']);
      assert.match(match.body.match.explanation, /React and ReactJS/);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.AI_API_KEY;
      delete process.env.AI_MODEL;
    }
  });

  it('rejects AI skill pairs not present in either profile and uses the exact-overlap fallback', async () => {
    const recruiter = await register('recruiter');
    const candidate = await register();
    const job = await createJob(recruiter.token);
    await request(app).patch('/api/auth/skills')
      .set('Authorization', `Bearer ${candidate.token}`).send({ skills: ['React'] });

    const originalFetch = globalThis.fetch;
    process.env.AI_API_KEY = 'test-only-key';
    process.env.AI_MODEL = 'test-model';
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ matches: [{ jobSkill: 'Python', candidateSkill: 'React' }] }) } }],
    }), { status: 200 });
    try {
      const match = await request(app).post(`/api/jobs/${job._id}/match`)
        .set('Authorization', `Bearer ${candidate.token}`);
      assert.equal(match.status, 200);
      assert.equal(match.body.match.method, 'deterministic');
      assert.equal(match.body.match.score, 50);
      assert.deepEqual(match.body.match.matchedSkills, ['React']);
      assert.match(match.body.match.notice, /AI matching was unavailable/);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.AI_API_KEY;
      delete process.env.AI_MODEL;
    }
  });
});

describe('career assistant', () => {
  it('mounts POST /api/assistant/chat and requires an authorized candidate session', async () => {
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    const recruiter = await register('recruiter');
    const candidate = await register();
    const anotherCandidate = await register();
    const job = await createJob(recruiter.token, jobData({ skills: ['React', 'Node.js'] }));
    await request(app).patch('/api/auth/skills')
      .set('Authorization', `Bearer ${candidate.token}`).send({ skills: ['React'] });
    await submitApplication(candidate.token, job._id);

    const unauthenticated = await request(app).post('/api/assistant/chat').send({ message: 'What jobs fit my skills?' });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.body.success, false);
    const recruiterDenied = await request(app).post('/api/assistant/chat')
      .set('Authorization', `Bearer ${recruiter.token}`).send({ message: 'Show my applicants' });
    assert.equal(recruiterDenied.status, 403);

    const ownStatus = await request(app).post('/api/assistant/chat')
      .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'What is my application status?' });
    assert.equal(ownStatus.status, 503);
    assert.match(ownStatus.headers['content-type'], /application\/json/);
    assert.equal(ownStatus.body.success, false);
    assert.match(ownStatus.body.message, /Set GEMINI_API_KEY in the server environment/);
    assert.doesNotMatch(ownStatus.body.message, /Senior React Engineer/);

    const isolated = await request(app).post('/api/assistant/chat')
      .set('Authorization', `Bearer ${anotherCandidate.token}`).send({ message: 'What is my application status?' });
    assert.equal(isolated.status, 503);
    assert.equal(isolated.body.message, ownStatus.body.message);

    const invalidMessage = await request(app).post('/api/assistant/chat')
      .set('Authorization', `Bearer ${candidate.token}`).send({ message: '  ' });
    assert.equal(invalidMessage.status, 400);

    const requirements = await request(app).post('/api/assistant/chat')
      .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'What requirements does Senior React Engineer have?' });
    assert.equal(requirements.status, 503);
    assert.match(requirements.body.message, /Set GEMINI_API_KEY in the server environment/);

    const preparation = await request(app).post('/api/assistant/chat')
      .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'How can I prepare for an interview?' });
    assert.equal(preparation.status, 503);
    assert.match(preparation.body.message, /Set GEMINI_API_KEY in the server environment/);
  });

  it('uses the current default Gemini model when GEMINI_MODEL is not set', async () => {
    const candidate = await register();
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = 'test-only-key';
    delete process.env.GEMINI_MODEL;
    let requestedModel;
    globalThis.fetch = async (_url, options) => {
      requestedModel = JSON.parse(options.body).model;
      return new Response(JSON.stringify({
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'A concise career response.' }] }],
      }), { status: 200 });
    };

    try {
      const generated = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`)
        .send({ message: 'Suggest job matches.' });
      assert.equal(generated.status, 200);
      assert.equal(generated.body.mode, 'ai');
      assert.equal(requestedModel, 'gemini-3.8-flash');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  it('retries transient provider failures once with a fresh signal and preserves the response contract', async () => {
    const candidate = await register();
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = 'test-only-key';
    const success = () => new Response(JSON.stringify({
      steps: [{ type: 'model_output', content: [{ type: 'text', text: 'A concise career response.' }] }],
    }), { status: 200 });
    const transientFailures = [
      async () => new Response('overloaded', { status: 503 }),
      async () => { throw new TypeError('fetch failed'); },
    ];

    try {
      for (const failFirstAttempt of transientFailures) {
        const signals = [];
        let attempts = 0;
        globalThis.fetch = async (_url, options) => {
          signals.push(options.signal);
          attempts += 1;
          return attempts === 1 ? failFirstAttempt() : success();
        };

        const generated = await request(app).post('/api/assistant/chat')
          .set('Authorization', `Bearer ${candidate.token}`)
          .send({ message: 'Suggest job matches.' });
        assert.equal(generated.status, 200);
        assert.deepEqual(generated.body, {
          success: true,
          reply: 'A concise career response.',
          mode: 'ai',
        });
        assert.equal(attempts, 2);
        assert.notEqual(signals[0], signals[1]);
        assert.ok(signals.every((signal) => signal instanceof AbortSignal));
      }
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  it('uses the verified Flash-Lite fallback after the primary model remains overloaded', async () => {
    const candidate = await register();
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = 'test-only-key';
    delete process.env.GEMINI_MODEL;
    const requestedModels = [];
    globalThis.fetch = async (_url, options) => {
      const { model } = JSON.parse(options.body);
      requestedModels.push(model);
      if (requestedModels.length < 3) {
        return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 });
      }
      return new Response(JSON.stringify({
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Fallback response.' }] }],
      }), { status: 200 });
    };

    try {
      const generated = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`)
        .send({ message: 'Suggest job matches.' });
      assert.equal(generated.status, 200);
      assert.deepEqual(generated.body, {
        success: true,
        reply: 'Fallback response.',
        mode: 'ai',
      });
      assert.deepEqual(requestedModels, [
        'gemini-3.8-flash',
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  it('falls back after a primary timeout and returns the frontend response contract', async () => {
    const candidate = await register();
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = 'test-only-key';
    delete process.env.GEMINI_MODEL;
    const calls = [];
    globalThis.fetch = async (_url, options) => {
      const { model } = JSON.parse(options.body);
      calls.push({ model, signal: options.signal });
      if (model === 'gemini-3.8-flash') {
        throw new DOMException('request timed out', 'TimeoutError');
      }
      return new Response(JSON.stringify({
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Fallback after timeout.' }] }],
      }), { status: 200 });
    };

    try {
      const generated = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`)
        .send({ message: 'Suggest job matches.' });
      assert.equal(generated.status, 200);
      assert.deepEqual(generated.body, {
        success: true,
        reply: 'Fallback after timeout.',
        mode: 'ai',
      });
      assert.deepEqual(calls.map(({ model }) => model), [
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
      ]);
      assert.notEqual(calls[0].signal, calls[1].signal);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  it('aborts stalled provider calls at the deadline and uses a fresh signal for fallback', async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    process.env.GEMINI_API_KEY = 'test-only-key';
    const signals = [];
    globalThis.setTimeout = (callback, _delay, ...args) =>
      originalSetTimeout(callback, 0, ...args);
    globalThis.fetch = async (_url, options) => {
      signals.push(options.signal);
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    };

    try {
      const timedOut = await generateCareerResponse({
        message: 'How should I prepare?',
        candidateSkills: [],
        applications: [],
        openJobs: [],
      });
      assert.equal(timedOut.mode, 'error');
      assert.match(timedOut.reply, /Gemini timed out/);
      assert.equal(signals.length, 2);
      assert.notEqual(signals[0], signals[1]);
      assert.ok(signals.every((signal) => signal.aborted));
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  it('returns sanitized errors and response-shape diagnostics for fallback failures', async () => {
    const candidate = await register();
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    process.env.GEMINI_API_KEY = 'test-only-key';
    delete process.env.GEMINI_MODEL;
    const diagnostics = [];
    console.warn = (...args) => diagnostics.push(args);

    try {
      globalThis.fetch = async (_url, options) => {
        const { model } = JSON.parse(options.body);
        if (model === 'gemini-3.8-flash') {
          throw new DOMException('request timed out', 'TimeoutError');
        }
        throw new DOMException('fallback timed out', 'TimeoutError');
      };
      const fallbackTimeout = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`)
        .send({ message: 'private career question' });
      assert.equal(fallbackTimeout.status, 503);
      assert.equal(fallbackTimeout.body.success, false);
      assert.match(fallbackTimeout.body.message, /Gemini timed out/);

      globalThis.fetch = async (_url, options) => {
        const { model } = JSON.parse(options.body);
        if (model !== 'gemini-3.5-flash-lite') {
          return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 });
        }
        return new Response(JSON.stringify({
          error: {
            status: 'UNAVAILABLE',
            message: 'Provider rejected private career question using test-only-key.',
          },
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      };
      const fallbackUnavailable = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`)
        .send({ message: 'private career question' });
      assert.equal(fallbackUnavailable.status, 503);
      assert.equal(fallbackUnavailable.body.success, false);
      assert.match(fallbackUnavailable.body.message, /temporarily unavailable/);

      globalThis.fetch = async (_url, options) => {
        const { model } = JSON.parse(options.body);
        if (model === 'gemini-3.8-flash') {
          throw new DOMException('request timed out', 'TimeoutError');
        }
        return new Response(JSON.stringify({ steps: { unexpected: true } }), { status: 200 });
      };
      const unexpectedShape = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`)
        .send({ message: 'private career question' });
      assert.equal(unexpectedShape.status, 503);
      assert.equal(unexpectedShape.body.success, false);
      assert.match(unexpectedShape.body.message, /temporarily unavailable/);

      const diagnosticText = JSON.stringify(diagnostics);
      assert.match(diagnosticText, /gemini-3\.5-flash-lite/);
      assert.match(diagnosticText, /UNAVAILABLE/);
      assert.match(diagnosticText, /responseShape/);
      assert.doesNotMatch(diagnosticText, /private career question|test-only-key/);
    } finally {
      globalThis.fetch = originalFetch;
      console.warn = originalWarn;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  it('uses Gemini answers and returns clear errors instead of unrelated fallbacks on failure', async () => {
    const candidate = await register();
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = 'test-only-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    let providerRequest;
    globalThis.fetch = async (url, options) => {
      providerRequest = { url, apiKey: options.headers['x-goog-api-key'], payload: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Review the role’s core skills and prepare one example for each.' }] }],
      }), { status: 200 });
    };

    try {
      const generated = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'How should I prepare for an interview?' });
      assert.equal(generated.status, 200);
      assert.equal(generated.body.mode, 'ai');
      assert.match(generated.body.reply, /prepare one example/i);
      assert.equal(providerRequest.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
      assert.equal(providerRequest.apiKey, 'test-only-key');
      assert.equal(providerRequest.payload.model, 'gemini-test-model');
      assert.equal(providerRequest.payload.store, false);
      assert.match(providerRequest.payload.system_instruction, /gap-year explanations, cover letters, resume improvements/);
      assert.match(providerRequest.payload.input, /How should I prepare for an interview/);

      const providerFailures = [
        [401, /could not authenticate/],
        [404, /model is unavailable or unsupported/],
        [429, /rate-limited/],
        [503, /temporarily unavailable/],
      ];
      for (const [status, expectedNotice] of providerFailures) {
        globalThis.fetch = async () => new Response('provider failure', { status });
        const failed = await request(app).post('/api/assistant/chat')
          .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'Help me prepare for interviews.' });
        assert.equal(failed.status, 503);
        assert.equal(failed.body.success, false);
        assert.match(failed.body.message, expectedNotice);
        assert.doesNotMatch(failed.body.message, /job listings|matching listed skills/i);
      }

      let timeoutAttempts = 0;
      globalThis.fetch = async () => {
        timeoutAttempts += 1;
        throw new DOMException('request timed out', 'TimeoutError');
      };
      const timedOut = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'How should I prepare?' });
      assert.equal(timedOut.status, 503);
      assert.match(timedOut.body.message, /Gemini timed out/);
      assert.equal(timeoutAttempts, 2);

      let networkAttempts = 0;
      globalThis.fetch = async () => {
        networkAttempts += 1;
        throw new TypeError('fetch failed');
      };
      const unreachable = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'How should I prepare?' });
      assert.equal(unreachable.status, 503);
      assert.match(unreachable.body.message, /Gemini could not be reached/);
      assert.equal(networkAttempts, 2);

      globalThis.fetch = async () => new Response(JSON.stringify({ steps: [] }), { status: 200 });
      const empty = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'How should I prepare?' });
      assert.equal(empty.status, 503);
      assert.match(empty.body.message, /AI assistant is temporarily unavailable/);

      const originalWarn = console.warn;
      const diagnostics = [];
      globalThis.fetch = async () => new Response(JSON.stringify({
        error: {
          status: 'INVALID_ARGUMENT',
          message: 'Rejected private question text for test-only-key; contact candidate@example.test.',
        },
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      console.warn = (...args) => diagnostics.push(args);
      try {
        const rejected = await request(app).post('/api/assistant/chat')
          .set('Authorization', `Bearer ${candidate.token}`)
          .send({ message: 'private question text' });
        assert.equal(rejected.status, 503);
        assert.match(rejected.body.message, /model is unavailable or unsupported/);
      } finally {
        console.warn = originalWarn;
      }
      const diagnosticText = JSON.stringify(diagnostics);
      assert.match(diagnosticText, /INVALID_ARGUMENT/);
      assert.match(diagnosticText, /Rejected/);
      assert.doesNotMatch(diagnosticText, /private question text|test-only-key|candidate@example\.test/);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  it('enforces the per-candidate message rate limit', async () => {
    const candidate = await register();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app).post('/api/assistant/chat')
        .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'Suggest job matches.' });
      assert.equal(response.status, 503);
    }
    const limited = await request(app).post('/api/assistant/chat')
      .set('Authorization', `Bearer ${candidate.token}`).send({ message: 'Suggest job matches.' });
    assert.equal(limited.status, 429);
  });
});