import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../lib/api';
import { clearResumeSelection } from '../lib/resumeSelection';
import { isValidIndianMobileNumber } from '../lib/indianMobile';

const isValidUrl = (str) => {
  try {
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
};

const isValidEmail = (str) => /^\S+@\S+\.\S+$/.test(str.trim());

function ApplyJob() {
  const { jobId }   = useParams();
  const navigate    = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [job,        setJob]        = useState(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [jobError,   setJobError]   = useState('');

  const [form, setForm] = useState({
    phone:              '+91 ',
    resumeUrl:          '',
    coverLetter:        '',
    relevantExperience: '',
    consentGiven:       false,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [resumeFile, setResumeFile] = useState(null);
  const resumeFileInputRef = useRef(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted,   setSubmitted]   = useState(false);

  // Redirect unauthenticated users to login, preserving the destination
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { state: { from: `/jobs/${jobId}/apply` }, replace: true });
    }
  }, [authLoading, isAuthenticated, jobId, navigate]);

  // Redirect recruiters away
  useEffect(() => {
    if (!authLoading && isAuthenticated && user?.role === 'recruiter') {
      navigate('/recruiter/dashboard', { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  // Fetch the job
  useEffect(() => {
    if (!jobId) return;
    const fetchJob = async () => {
      setJobLoading(true);
      try {
        const res  = await apiFetch(`/jobs/public/${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Job not found.');
        setJob(data.job);
      } catch (err) {
        setJobError(err.message || 'Failed to load job details.');
      } finally {
        setJobLoading(false);
      }
    };
    fetchJob();
  }, [jobId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (name === 'resumeUrl' && value.trim()) {
      setResumeFile(clearResumeSelection(resumeFileInputRef.current));
    }
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    if (submitError) setSubmitError('');
  };

  const validate = () => {
    const errs = {};
    const email = user?.email?.trim() || '';
    const phone = form.phone.trim();
    const resumeUrl = form.resumeUrl.trim();
    if (!email) errs.email = 'Email address is required.';
    else if (!isValidEmail(email)) errs.email = 'Enter a valid email address on your account.';
    const nationalPhone = phone.replace(/[\s-]/g, '').replace(/^\+91/, '');
    if (!nationalPhone)
      errs.phone = 'Phone number is required.';
    else if (!isValidIndianMobileNumber(phone))
      errs.phone = 'Enter a valid Indian mobile number with 10 digits, optionally prefixed by +91.';
    if (resumeUrl && !isValidUrl(resumeUrl))
      errs.resumeUrl = 'Resume URL must be a valid HTTP or HTTPS URL.';
    else if (!resumeUrl && !resumeFile)
      errs.resumeUrl = 'Provide a valid resume/portfolio URL or upload a resume.';
    if (resumeFile) {
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      const extension = resumeFile.name.split('.').pop()?.toLowerCase();
      if (resumeFile.size > 5 * 1024 * 1024) errs.resumeFile = 'Resume must be 5 MB or smaller.';
      else if (!['pdf', 'docx'].includes(extension) || !allowedTypes.includes(resumeFile.type)) {
        errs.resumeFile = 'Choose a PDF or DOCX resume.';
      }
    }
    if (!form.coverLetter.trim()) errs.coverLetter = 'Cover letter is required.';
    if (!form.relevantExperience.trim()) errs.relevantExperience = 'Relevant experience is required.';
    if (!form.consentGiven)
      errs.consentGiven = 'You must confirm the information is accurate to submit.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const applicationData = {
        ...form,
        phone: form.phone.trim(),
        resumeUrl: form.resumeUrl.trim(),
        coverLetter: form.coverLetter.trim(),
        relevantExperience: form.relevantExperience.trim(),
      };
      const headers = {};
      let body;
      if (resumeFile) {
        body = new FormData();
        Object.entries(applicationData).forEach(([key, value]) => body.append(key, String(value)));
        body.append('resume', resumeFile);
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(applicationData);
      }

      const res  = await apiFetch(`/applications/${jobId}`, {
        method: 'POST',
        headers,
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to submit application.');
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Network error — could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading auth ───────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Loading job ────────────────────────────────────────
  if (jobLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4 animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-2/3" />
          <div className="h-4 bg-slate-100 rounded w-1/3" />
          <div className="space-y-3 pt-4">
            {[1,2,3].map(i=><div key={i} className="h-10 bg-slate-100 rounded-lg"/>)}
          </div>
        </div>
      </div>
    );
  }

  // ── Job error ──────────────────────────────────────────
  if (jobError || !job) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-4xl">❌</div>
        <h2 className="text-xl font-bold text-slate-900">Job Not Found</h2>
        <p className="text-sm text-slate-500">{jobError}</p>
        <Link to="/jobs" className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg">
          Browse Jobs
        </Link>
      </div>
    );
  }

  // ── Closed job ─────────────────────────────────────────
  if (job.status === 'closed') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-4xl">🔒</div>
        <h2 className="text-xl font-bold text-slate-900">Applications Closed</h2>
        <p className="text-sm text-slate-500">
          <strong>{job.title}</strong> at <strong>{job.company}</strong> is no longer accepting applications.
        </p>
        <Link to="/jobs" className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg">
          Browse Open Jobs
        </Link>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-xs p-8 sm:p-10 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-3xl">✅</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-slate-900">Application Submitted!</h2>
            <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
              Application submitted successfully! Thank you for applying. Our recruitment team will review your application and contact you if your profile matches the role.
            </p>
          </div>
          <div className="pt-2 bg-slate-50 rounded-xl p-4 text-left text-sm space-y-1 border border-slate-100">
            <p className="font-semibold text-slate-800">{job.title}</p>
            <p className="text-slate-500">{job.company}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              to="/jobs"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Browse More Jobs
            </Link>
            <Link
              to="/my-applications"
              className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              My Applications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 flex items-center gap-1.5">
        <Link to="/jobs" className="hover:text-blue-600 transition-colors">Browse Jobs</Link>
        <span>›</span>
        <Link to={`/jobs/${jobId}`} className="hover:text-blue-600 transition-colors">{job.title}</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Apply</span>
      </nav>

      {/* Job summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-lg shrink-0">
            {job.company.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{job.title}</h1>
            <p className="text-sm text-slate-600 font-medium">{job.company}</p>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded">📍 {job.location}</span>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded">💼 {job.jobType}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Application form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8">
        <div className="mb-6 space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Your Application</h2>
          <p className="text-sm text-slate-500">
            Fields marked <span className="text-rose-500 font-semibold">*</span> are required.
          </p>
        </div>

        {submitError && (
          <div className="mb-5 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
            <span>⚠️</span>
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Full Name — prefilled, read-only */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={user?.name || ''}
              readOnly
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">Prefilled from your account.</p>
          </div>

          {/* Email — prefilled, read-only */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              required
              maxLength={254}
              aria-invalid={Boolean(fieldErrors.email)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">Prefilled from your account.</p>
            {fieldErrors.email && <p className="text-xs text-rose-600 mt-1">{fieldErrors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Phone Number <span className="text-rose-500">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="+91 98765 43210"
              required
              maxLength={15}
              pattern="(?:\+91[\s-]?)?[6-9][0-9]{9}|(?:\+91[\s-]?)?[6-9][0-9]{4}[\s-][0-9]{5}"
              aria-invalid={Boolean(fieldErrors.phone)}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                fieldErrors.phone ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
              }`}
            />
            {fieldErrors.phone && <p className="text-xs text-rose-600 mt-1">{fieldErrors.phone}</p>}
          </div>

          {/* Resume URL */}
          <div>
            <label htmlFor="resumeUrl" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Resume / Portfolio URL <span className="text-slate-400 normal-case font-normal">fallback</span>
            </label>
            <input
              id="resumeUrl"
              type="url"
              name="resumeUrl"
              value={form.resumeUrl}
              onChange={handleChange}
              placeholder="https://linkedin.com/in/yourprofile or https://github.com/you"
              required={!resumeFile}
              maxLength={500}
              aria-invalid={Boolean(fieldErrors.resumeUrl)}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                fieldErrors.resumeUrl ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
              }`}
            />
            {fieldErrors.resumeUrl && <p className="text-xs text-rose-600 mt-1">{fieldErrors.resumeUrl}</p>}
          </div>

          <div>
            <label htmlFor="resumeFile" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Or upload a resume <span className="text-slate-400 normal-case font-normal">— PDF or DOCX, max 5 MB</span>
            </label>
            <input
              id="resumeFile"
              ref={resumeFileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required={!form.resumeUrl.trim()}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setResumeFile(file);
                if (file) setForm((previous) => ({ ...previous, resumeUrl: '' }));
                setFieldErrors((previous) => ({ ...previous, resumeFile: '', resumeUrl: '' }));
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700"
            />
            {resumeFile && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-slate-500">Selected: {resumeFile.name}</p>
                <button
                  type="button"
                  onClick={() => {
                    setResumeFile(clearResumeSelection(resumeFileInputRef.current));
                    setFieldErrors((previous) => ({ ...previous, resumeFile: '' }));
                  }}
                  className="shrink-0 text-xs font-semibold text-rose-700 hover:underline"
                >
                  Remove file
                </button>
              </div>
            )}
            {fieldErrors.resumeFile && <p className="text-xs text-rose-600 mt-1">{fieldErrors.resumeFile}</p>}
          </div>

          {/* Cover Letter */}
          <div>
            <label htmlFor="coverLetter" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Cover Letter <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="coverLetter"
              name="coverLetter"
              value={form.coverLetter}
              onChange={handleChange}
              rows={5}
              required
              maxLength={3000}
              aria-invalid={Boolean(fieldErrors.coverLetter)}
              placeholder="Introduce yourself and explain why you're excited about this role…"
              className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y ${fieldErrors.coverLetter ? 'border-rose-400 bg-rose-50' : 'border-slate-300'}`}
            />
            {fieldErrors.coverLetter && <p className="text-xs text-rose-600 mt-1">{fieldErrors.coverLetter}</p>}
            <p className="text-xs text-slate-400 mt-1">{form.coverLetter.length} / 3000</p>
          </div>

          {/* Relevant Experience */}
          <div>
            <label htmlFor="relevantExperience" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Relevant Experience <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="relevantExperience"
              name="relevantExperience"
              value={form.relevantExperience}
              onChange={handleChange}
              rows={4}
              required
              maxLength={2000}
              aria-invalid={Boolean(fieldErrors.relevantExperience)}
              placeholder="Briefly describe your most relevant experience for this role…"
              className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y ${fieldErrors.relevantExperience ? 'border-rose-400 bg-rose-50' : 'border-slate-300'}`}
            />
            {fieldErrors.relevantExperience && <p className="text-xs text-rose-600 mt-1">{fieldErrors.relevantExperience}</p>}
            <p className="text-xs text-slate-400 mt-1">{form.relevantExperience.length} / 2000</p>
          </div>

          {/* Consent */}
          <div className={`p-4 rounded-xl border ${fieldErrors.consentGiven ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="consentGiven"
                checked={form.consentGiven}
                onChange={handleChange}
                className="mt-0.5 w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
              <span className="text-xs text-slate-700 leading-relaxed">
                <span className="text-rose-500 font-semibold">*</span>{' '}
                I confirm that all information submitted in this application is accurate and complete. I understand that providing false information may disqualify my application.
              </span>
            </label>
            {fieldErrors.consentGiven && (
              <p className="text-xs text-rose-600 mt-2">{fieldErrors.consentGiven}</p>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <Link
              to={`/jobs/${jobId}`}
              className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </>
              ) : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ApplyJob;
