import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/useAuth';
import EditJobModal from '../components/EditJobModal';
import { apiFetch, apiUrl } from '../lib/api';
import { statusOptionsFor } from '../lib/applicationStatus';
import { formatSalary } from '../lib/salary';

/* ─── Constants ──────────────────────────────────────────── */

const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'remote', 'freelance'];
const EXP_LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'];
const JOB_CATEGORIES = ['engineering', 'design', 'product', 'data', 'sales', 'marketing', 'customer-support', 'operations', 'finance', 'human-resources', 'other'];

// Mirrors the guard in server/src/controllers/applicationController.js (scheduleApplicationInterview).
// The backend normalizes "Submitted" to "Applied" before checking, so legacy "Submitted" rows are accepted too.
const INTERVIEW_SCHEDULABLE_STATUSES = ['Applied', 'Submitted', 'Under Review', 'Shortlisted', 'Interview'];

const LABEL = {
  'full-time': 'Full-Time',
  'part-time': 'Part-Time',
  contract: 'Contract',
  internship: 'Internship',
  remote: 'Remote',
  freelance: 'Freelance',
  entry: 'Entry Level',
  mid: 'Mid Level',
  senior: 'Senior',
  lead: 'Lead',
  executive: 'Executive',
};

const EMPTY_FORM = {
  title: '',
  company: '',
  description: '',
  location: '',
  category: 'engineering',
  workMode: 'onsite',
  jobType: 'full-time',
  experienceLevel: 'mid',
  salaryMin: '',
  salaryMax: '',
  skills: '',
};

const isSafeResumeUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const resumeViewUrl = (path) => `${apiUrl(path)}?disposition=inline`;
const getResumePreviewType = (application) => {
  if (application.resumePreviewType === 'pdf' || application.resumePreviewType === 'docx') {
    return application.resumePreviewType;
  }
  if (/\.pdf$/i.test(application.resumeFileName || '')) return 'pdf';
  if (/\.docx$/i.test(application.resumeFileName || '')) return 'docx';
  return null;
};

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function DocxResumePreview({ file, filename, onClose }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return undefined;
    container.replaceChildren();

    const renderPreview = async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        await renderAsync(file, container, container, {
          renderAltChunks: false,
          renderComments: false,
        });
      } catch {
        if (!cancelled) setError('This DOCX file could not be previewed. Try downloading it instead.');
      }
    };
    void renderPreview();

    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [file]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-preview-title"
        className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 id="resume-preview-title" className="truncate text-sm font-semibold text-slate-800">
            Resume preview: {filename}
          </h2>
          <button type="button" onClick={onClose} className="rounded px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Close
          </button>
        </header>
        <div className="overflow-auto bg-slate-100 p-4 sm:p-6">
          {error ? (
            <p role="alert" className="rounded-lg bg-white p-6 text-sm text-rose-700">{error}</p>
          ) : (
            <div ref={containerRef} className="docx-resume-preview" />
          )}
        </div>
      </section>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────── */
function RecruiterDashboard() {
  const { user } = useAuth();

  // Tab: 'overview' | 'create' | 'manage' | 'applicants'
  const [activeTab, setActiveTab] = useState('overview');

  /* ── Create-job form ──────────────────────────────────── */
  const [form, setForm] = useState(EMPTY_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  /* ── My-jobs list ─────────────────────────────────────── */
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState('all');

  /* ── Per-row action state ─────────────────────────────── */
  const [deletingId, setDeletingId] = useState(null);
  const [closingId, setClosingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  /* ── Edit modal ───────────────────────────────────────── */
  const [editJob, setEditJob] = useState(null);
  const [editSuccess, setEditSuccess] = useState('');

  /* ── Applicants ───────────────────────────────────────── */
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState('');
  const [appsMessage, setAppsMessage] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(null); // appId being updated
  const [interviewUpdating, setInterviewUpdating] = useState(null);
  const [resumeDownloadingId, setResumeDownloadingId] = useState(null);
  const [resumeDownloadErrors, setResumeDownloadErrors] = useState({});
  const [resumePreviewingId, setResumePreviewingId] = useState(null);
  const [resumePreviewError, setResumePreviewError] = useState('');
  const [resumePreview, setResumePreview] = useState(null);
  const [applicationJobFilter, setApplicationJobFilter] = useState('');
  const [applicationStatusFilter, setApplicationStatusFilter] = useState('');

  const APP_STATUSES = ['Applied', 'Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired'];
  const STATUS_STYLES = {
    'Applied':      'bg-blue-100 text-blue-700',
    'Submitted':    'bg-blue-100 text-blue-700',
    'Under Review': 'bg-amber-100 text-amber-700',
    'Shortlisted':  'bg-purple-100 text-purple-700',
    'Interview':    'bg-cyan-100 text-cyan-700',
    'Rejected':     'bg-rose-100 text-rose-600',
    'Hired':        'bg-emerald-100 text-emerald-700',
  };

  /* ─── Fetch recruiter's jobs ───────────────────────────── */
  const fetchMyJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError('');
    setActionError('');
    try {
      const res = await apiFetch('/jobs/my-jobs', {
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load your job listings.');
      setJobs(data.jobs);
    } catch (err) {
      setJobsError(err.message || 'Network error — could not fetch jobs.');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  /* ─── Fetch applications for recruiter's jobs ──────────── */
  const fetchApplications = useCallback(async () => {
    setAppsLoading(true);
    setAppsError('');
    try {
      const res = await apiFetch('/applications/recruiter', {
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load applications.');
      setApplications(data.applications);
    } catch (err) {
      setAppsError(err.message || 'Network error — could not fetch applications.');
    } finally {
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'manage' || activeTab === 'overview') fetchMyJobs();
    if (activeTab === 'applicants' || activeTab === 'overview') fetchApplications();
  }, [activeTab, fetchMyJobs, fetchApplications]);

  const visibleJobs = jobs.filter((job) => jobStatusFilter === 'all' || job.status === jobStatusFilter);

  /* ─── Tab switch (clears ephemeral feedback) ───────────── */
  const switchTab = (tab) => {
    setActiveTab(tab);
    setCreateError('');
    setCreateSuccess('');
    setActionError('');
    setEditSuccess('');
    setDeletingId(null);
    setClosingId(null);
    setAppsError('');
    setAppsMessage('');
    setStatusUpdating(null);
    setInterviewUpdating(null);
  };

  /* ─── Update application status ───────────────────────── */
  const handleStatusUpdate = async (appId, newStatus) => {
    setStatusUpdating(appId);
    try {
      const res = await apiFetch(`/applications/${appId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update status.');
      setApplications((prev) =>
        prev.map((a) => (a._id === appId ? {
          ...a,
          status: data.application.status,
          statusHistory: data.application.statusHistory,
          interview: data.application.interview,
        } : a))
      );
      setAppsMessage('Application status updated.');
      setAppsError('');
    } catch (err) {
      setAppsError(err.message || 'Network error — could not update status.');
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleResumeDownload = async (application) => {
    setResumeDownloadingId(application._id);
    setResumeDownloadErrors((previous) => ({ ...previous, [application._id]: '' }));
    try {
      const response = await apiFetch(application.resumeDownloadPath);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Resume download failed (HTTP ${response.status}).`);
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = application.resumeFileName || 'resume';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setResumeDownloadErrors((previous) => ({
        ...previous,
        [application._id]: error.message || 'Could not download this resume. Please try again.',
      }));
    } finally {
      setResumeDownloadingId(null);
    }
  };

  const handleResumePreview = async (application) => {
    setResumePreviewingId(application._id);
    setResumePreviewError('');
    try {
      const response = await apiFetch(`${application.resumeDownloadPath}?disposition=inline`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Resume preview failed (HTTP ${response.status}).`);
      }
      setResumePreview({
        file: await response.blob(),
        filename: application.resumeFileName || 'resume.docx',
      });
    } catch (error) {
      setResumePreviewError(`${application._id}: ${error.message || 'Could not load this resume preview.'}`);
    } finally {
      setResumePreviewingId(null);
    }
  };

  const handleInterviewSchedule = async (event, appId) => {
    event.preventDefault();
    setInterviewUpdating(appId);
    setAppsError('');
    setAppsMessage('');
    try {
      const formData = new FormData(event.currentTarget);
      const scheduledAt = new Date(
        `${formData.get('interviewDate')}T${formData.get('interviewTime')}`
      ).toISOString();
      const res = await apiFetch(`/applications/${appId}/interview`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduledAt,
          meetingDetails: formData.get('meetingDetails'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save the interview schedule.');
      setApplications((previous) => previous.map((application) => (
        application._id === appId ? {
          ...application,
          status: data.application.status,
          statusHistory: data.application.statusHistory,
          interview: data.application.interview,
        } : application
      )));
      setAppsMessage(data.message);
    } catch (error) {
      setAppsError(error.message || 'Could not save the interview schedule.');
    } finally {
      setInterviewUpdating(null);
    }
  };

  const uniqueApplicationJobs = [...new Map(
    applications.filter((application) => application.job)
      .map((application) => [application.job._id, application.job])
  ).values()];
  const filteredApplications = applications.filter((application) => (
    (!applicationJobFilter || application.job?._id === applicationJobFilter)
    && (!applicationStatusFilter || application.status === applicationStatusFilter)
  ));
  const dashboardStats = [
    { label: 'Total jobs', value: jobs.length },
    { label: 'Active jobs', value: jobs.filter((job) => job.status === 'open').length },
    { label: 'Applications', value: applications.length },
    { label: 'Shortlisted', value: applications.filter((application) => application.status === 'Shortlisted').length },
    { label: 'Interviews', value: applications.filter((application) => application.status === 'Interview').length },
    { label: 'Hires', value: applications.filter((application) => application.status === 'Hired').length },
  ];

  /* ─── Create-job form handlers ─────────────────────────── */
  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (createError) setCreateError('');
  };

  const validateCreateForm = () => {
    if (!form.title.trim()) return 'Job title is required.';
    if (!form.company.trim()) return 'Company name is required.';
    if (!form.location.trim()) return 'Location is required.';
    if (!form.description.trim()) return 'Job description is required.';
    if (form.description.trim().length < 30)
      return 'Description must be at least 30 characters.';
    if (form.salaryMin !== '' && isNaN(Number(form.salaryMin)))
      return 'Minimum salary must be a valid number.';
    if (form.salaryMax !== '' && isNaN(Number(form.salaryMax)))
      return 'Maximum salary must be a valid number.';
    if (
      form.salaryMin !== '' &&
      form.salaryMax !== '' &&
      Number(form.salaryMax) < Number(form.salaryMin)
    )
      return 'Maximum salary must be ≥ minimum salary.';
    return null;
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    const validationError = validateCreateForm();
    if (validationError) { setCreateError(validationError); return; }

    setCreateLoading(true);
    try {
      const res = await apiFetch('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          salaryMin: form.salaryMin !== '' ? Number(form.salaryMin) : null,
          salaryMax: form.salaryMax !== '' ? Number(form.salaryMax) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create job listing.');

      setCreateSuccess(`"${data.job.title}" posted successfully!`);
      setForm(EMPTY_FORM);
      // Pre-load the jobs list in background so Manage Jobs is current
      fetchMyJobs();
    } catch (err) {
      setCreateError(err.message || 'Network error — could not reach the server.');
    } finally {
      setCreateLoading(false);
    }
  };

  /* ─── Close job ────────────────────────────────────────── */
  const confirmClose = async (jobId) => {
    setActionError('');
    setActionLoading(jobId);
    try {
      const res = await apiFetch(`/jobs/${jobId}/close`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to close job.');
      setJobs((prev) => prev.map((j) => (j._id === jobId ? data.job : j)));
      setClosingId(null);
    } catch (err) {
      setActionError(err.message || 'Network error — could not close job.');
      setClosingId(null);
    } finally {
      setActionLoading(null);
    }
  };

  const reopenJob = async (jobId) => {
    setActionError('');
    setActionLoading(jobId);
    try {
      const res = await apiFetch(`/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'open' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reopen job.');
      setJobs((prev) => prev.map((job) => (job._id === jobId ? data.job : job)));
    } catch (err) {
      setActionError(err.message || 'Network error — could not reopen job.');
    } finally {
      setActionLoading(null);
    }
  };

  /* ─── Delete job ───────────────────────────────────────── */
  const confirmDelete = async (jobId) => {
    setActionError('');
    setActionLoading(jobId);
    try {
      const res = await apiFetch(`/jobs/${jobId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete job.');
      setJobs((prev) => prev.filter((j) => j._id !== jobId));
      setDeletingId(null);
    } catch (err) {
      setActionError(err.message || 'Network error — could not delete job.');
      setDeletingId(null);
    } finally {
      setActionLoading(null);
    }
  };

  /* ─── Edit save callback ───────────────────────────────── */
  const handleEditSave = (updatedJob) => {
    setJobs((prev) => prev.map((j) => (j._id === updatedJob._id ? updatedJob : j)));
    setEditJob(null);
    setEditSuccess(`"${updatedJob.title}" updated successfully.`);
  };

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */
  return (
    <>
      {/* Edit modal — renders on top of everything */}
      {editJob && (
        <EditJobModal
          job={editJob}
          onSave={handleEditSave}
          onClose={() => setEditJob(null)}
        />
      )}
      {resumePreview && (
        <DocxResumePreview
          file={resumePreview.file}
          filename={resumePreview.filename}
          onClose={() => setResumePreview(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

        {/* ── Header ────────────────────────────────────── */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold uppercase tracking-wide">
              Recruiter Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome, {user?.name || 'Recruiter'}
            </h1>
            <p className="text-sm text-slate-600">
              Manage your listings, track candidate pipelines, and build your team.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-500">Logged in as</p>
              <p className="text-sm font-semibold text-slate-800">{user?.email}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'R'}
            </div>
          </div>
        </div>

        {/* ── Tab Navigation ─────────────────────────────── */}
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'overview',    label: '🏠 Overview' },
            { key: 'create',      label: '✍️ Post a Job' },
            { key: 'manage',      label: '📋 Manage Jobs' },
            { key: 'applicants',  label: '👥 Applicants' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════
            TAB: OVERVIEW
        ══════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <section aria-label="Recruiting metrics" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">Hiring snapshot</h2>
                {(jobsLoading || appsLoading) && <span className="text-xs text-slate-500">Updating metrics…</span>}
              </div>
              {(jobsError || appsError) && (
                <p role="alert" className="text-xs text-rose-700">{jobsError || appsError}</p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {dashboardStats.map(({ label, value }) => (
                  <div key={label} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </section>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* Post a Job */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 transition-all flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl">✍️</div>
                  <h3 className="text-lg font-bold text-slate-900">Post a Job</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Create a new job opportunity with role descriptions, requirements, and compensation details.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchTab('create')}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                >
                  + Create New Job
                </button>
              </div>

              {/* Manage Jobs */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 transition-all flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center text-xl">📋</div>
                  <h3 className="text-lg font-bold text-slate-900">Manage Jobs</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    View and edit your published listings, change status, or remove filled vacancies.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchTab('manage')}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer"
                >
                  View Active Jobs
                </button>
              </div>

              {/* Applicants */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 transition-all flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">👥</div>
                  <h3 className="text-lg font-bold text-slate-900">Applicants</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Review candidates, track application stage, and manage your hiring pipeline.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchTab('applicants')}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                >
                  View Applicants
                </button>
              </div>
            </div>

            {/* Session Details */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900">Verified Recruiter Session Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-medium">Recruiter Name</span>
                  <p className="text-slate-900 font-bold mt-0.5">{user?.name}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-medium">Account Role</span>
                  <p className="text-purple-700 font-bold mt-0.5 capitalize">{user?.role}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-medium">Email Address</span>
                  <p className="text-slate-900 font-bold mt-0.5">{user?.email}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: POST A JOB
        ══════════════════════════════════════════════════ */}
        {activeTab === 'create' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8">
            <div className="mb-6 space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Create a New Job Listing</h2>
              <p className="text-sm text-slate-500">
                Fields marked <span className="text-rose-500 font-semibold">*</span> are required.
              </p>
            </div>

            {/* Feedback banners */}
            {createError && (
              <div className="mb-5 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
                <span aria-hidden="true">⚠️</span>
                <span>{createError}</span>
              </div>
            )}
            {createSuccess && (
              <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
                <span aria-hidden="true">✅</span>
                <span>
                  {createSuccess}{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('manage')}
                    className="underline font-semibold cursor-pointer"
                  >
                    View in Manage Jobs →
                  </button>
                </span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} noValidate className="space-y-5">

              {/* Title + Company */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="c-title" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Job Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="c-title"
                    type="text"
                    name="title"
                    value={form.title}
                    onChange={handleFormChange}
                    placeholder="e.g. Senior Frontend Engineer"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="c-company" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Company <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="c-company"
                    type="text"
                    name="company"
                    value={form.company}
                    onChange={handleFormChange}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label htmlFor="c-location" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Location <span className="text-rose-500">*</span>
                </label>
                <input
                  id="c-location"
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleFormChange}
                  placeholder="e.g. New York, NY or Remote"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label htmlFor="c-category" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Category
                  <select id="c-category" name="category" value={form.category} onChange={handleFormChange} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm normal-case">
                    {JOB_CATEGORIES.map((category) => <option key={category} value={category}>{LABEL[category] || category.replaceAll('-', ' ')}</option>)}
                  </select>
                </label>
                <label htmlFor="c-workMode" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Work Mode
                  <select id="c-workMode" name="workMode" value={form.workMode} onChange={handleFormChange} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm normal-case">
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">On-site</option>
                  </select>
                </label>
              </div>

              {/* Job Type + Experience Level */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="c-jobType" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Job Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="c-jobType"
                    name="jobType"
                    value={form.jobType}
                    onChange={handleFormChange}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t} value={t}>{LABEL[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="c-exp" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Experience Level <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="c-exp"
                    name="experienceLevel"
                    value={form.experienceLevel}
                    onChange={handleFormChange}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                  >
                    {EXP_LEVELS.map((l) => (
                      <option key={l} value={l}>{LABEL[l]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Salary Range */}
              <div>
                <p className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                  Salary Range (INR ₹){' '}
                  <span className="text-slate-400 normal-case font-normal">— optional</span>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="c-salMin" className="sr-only">Minimum salary</label>
                    <input
                      id="c-salMin"
                      type="number"
                      name="salaryMin"
                      value={form.salaryMin}
                      onChange={handleFormChange}
                      placeholder="Min — e.g. ₹300000"
                      min="0"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="c-salMax" className="sr-only">Maximum salary</label>
                    <input
                      id="c-salMax"
                      type="number"
                      name="salaryMax"
                      value={form.salaryMax}
                      onChange={handleFormChange}
                      placeholder="Max — e.g. ₹600000"
                      min="0"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="c-desc" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Job Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="c-desc"
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  rows={6}
                  placeholder="Describe the role, responsibilities, and what makes a great candidate…"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {form.description.length} / 5000 characters (min 30)
                </p>
              </div>

              {/* Required Skills */}
              <div>
                <label htmlFor="c-skills" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Required Skills{' '}
                  <span className="text-slate-400 normal-case font-normal">— comma-separated, optional</span>
                </label>
                <input
                  id="c-skills"
                  type="text"
                  name="skills"
                  value={form.skills}
                  onChange={handleFormChange}
                  placeholder="e.g. React, Node.js, TypeScript, MongoDB"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                {/* Live skill tag preview */}
                {form.skills.trim() && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.skills.split(',').map((s) => s.trim()).filter(Boolean).map((skill, i) => (
                      <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setForm(EMPTY_FORM); setCreateError(''); setCreateSuccess(''); }}
                  disabled={createLoading}
                  className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {createLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      Posting…
                    </>
                  ) : (
                    '+ Post Job Listing'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: MANAGE JOBS
        ══════════════════════════════════════════════════ */}
        {activeTab === 'manage' && (
          <div className="space-y-4">

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">My Job Listings</h2>
              <button
                type="button"
                onClick={fetchMyJobs}
                disabled={jobsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                {jobsLoading
                  ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  : '🔄'
                }
                {' '}Refresh
              </button>
            </div>

            {/* Edit success */}
            {editSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
                <span aria-hidden="true">✅</span>
                <span>{editSuccess}</span>
              </div>
            )}

            {/* Action error */}
            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
                <span aria-hidden="true">⚠️</span>
                <span>{actionError}</span>
              </div>
            )}

            {/* Loading spinner */}
            {jobsLoading && (
              <div className="flex justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-[3px] border-purple-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500 font-medium">Loading your jobs…</p>
                </div>
              </div>
            )}

            {/* Fetch error */}
            {!jobsLoading && jobsError && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex items-start gap-2">
                <span aria-hidden="true">⚠️</span>
                <span>{jobsError}</span>
              </div>
            )}

            {/* Empty state */}
            {!jobsLoading && !jobsError && jobs.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                <div className="text-4xl" aria-hidden="true">📭</div>
                <h3 className="text-base font-bold text-slate-900">No job listings yet</h3>
                <p className="text-sm text-slate-500">Post your first job to start attracting candidates.</p>
                <button
                  type="button"
                  onClick={() => switchTab('create')}
                  className="mt-2 inline-flex items-center gap-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  + Post a Job
                </button>
              </div>
            )}

            {/* Jobs list */}
            {!jobsLoading && !jobsError && jobs.length > 0 && (
              <div className="space-y-4">
                {/* Summary */}
                <p className="text-xs text-slate-500">
                  {jobs.length} listing{jobs.length !== 1 ? 's' : ''} ·{' '}
                  <span className="text-emerald-600 font-medium">
                    {jobs.filter((j) => j.status === 'open').length} open
                  </span>{' '}
                  ·{' '}
                  <span className="text-slate-400">
                    {jobs.filter((j) => j.status === 'closed').length} closed
                  </span>
                </p>

                <div role="group" aria-label="Filter jobs by status" className="inline-flex rounded-lg border border-slate-300 p-1">
                  {[
                    { value: 'all', label: 'All Jobs' },
                    { value: 'open', label: 'Open Jobs' },
                    { value: 'closed', label: 'Closed Jobs' },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={jobStatusFilter === filter.value}
                      onClick={() => setJobStatusFilter(filter.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${jobStatusFilter === filter.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {visibleJobs.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">No jobs match this status filter.</p>
                )}

                {visibleJobs.map((job) => {
                  const isClosed = job.status === 'closed';
                  const isThisDeleting = deletingId === job._id;
                  const isThisClosing = closingId === job._id;
                  const isThisLoading = actionLoading === job._id;

                  return (
                    <div
                      key={job._id}
                      className={`bg-white rounded-2xl border shadow-xs p-5 sm:p-6 space-y-4 transition-all ${
                        isClosed
                          ? 'border-slate-300'
                          : 'border-slate-200 hover:border-purple-200'
                      }`}
                    >
                      {/* Card header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900 truncate">{job.title}</h3>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                isClosed
                                  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {isClosed ? 'Closed' : 'Open'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 font-medium">{job.company}</p>
                          <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 pt-0.5">
                            <span>📍 {job.location}</span>
                            <span>·</span>
                            <span>💼 {LABEL[job.jobType] || job.jobType}</span>
                            <span>·</span>
                            <span>🎯 {LABEL[job.experienceLevel] || job.experienceLevel}</span>
                            <span>·</span>
                            <span>💰 {formatSalary(job.salaryMin, job.salaryMax)}</span>
                          </div>
                        </div>

                        {/* Action buttons — normal state */}
                        {!isThisDeleting && !isThisClosing && (
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <button
                              type="button"
                              disabled={isThisLoading}
                              onClick={() => { setEditJob(job); setEditSuccess(''); }}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              ✏️ Edit
                            </button>
                            {!isClosed && (
                              <button
                                type="button"
                                disabled={isThisLoading}
                                onClick={() => { setActionError(''); setClosingId(job._id); }}
                                className="px-3 py-1.5 rounded-lg border border-amber-300 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                🔒 Close
                              </button>
                            )}
                            {isClosed && (
                              <button
                                type="button"
                                disabled={isThisLoading}
                                onClick={() => reopenJob(job._id)}
                                className="px-3 py-1.5 rounded-lg border border-emerald-300 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Reopen
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isThisLoading}
                              onClick={() => { setActionError(''); setDeletingId(job._id); }}
                              className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              🗑 Delete
                            </button>
                          </div>
                        )}

                        {/* Confirm close */}
                        {isThisClosing && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-amber-700 font-medium">Close this job?</span>
                            <button
                              type="button"
                              disabled={isThisLoading}
                              onClick={() => confirmClose(job._id)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1"
                            >
                              {isThisLoading && (
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              )}
                              Confirm
                            </button>
                            <button
                              type="button"
                              disabled={isThisLoading}
                              onClick={() => setClosingId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {/* Confirm delete */}
                        {isThisDeleting && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-rose-700 font-medium">Delete permanently?</span>
                            <button
                              type="button"
                              disabled={isThisLoading}
                              onClick={() => confirmDelete(job._id)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1"
                            >
                              {isThisLoading && (
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              )}
                              Delete
                            </button>
                            <button
                              type="button"
                              disabled={isThisLoading}
                              onClick={() => setDeletingId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Description preview */}
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {job.description}
                      </p>

                      {/* Skills */}
                      {job.skills && job.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {job.skills.slice(0, 8).map((skill, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-xs font-medium"
                            >
                              {skill}
                            </span>
                          ))}
                          {job.skills.length > 8 && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs">
                              +{job.skills.length - 8} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
                        Posted{' '}
                        {new Date(job.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                        {job.updatedAt !== job.createdAt && (
                          <>
                            {' · Updated '}
                            {new Date(job.updatedAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* ══════════════════════════════════════════════════
          TAB: APPLICANTS
      ══════════════════════════════════════════════════ */}
      {activeTab === 'applicants' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900">Applications Received</h2>
            <button
              type="button"
              onClick={fetchApplications}
              disabled={appsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {appsLoading
                ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                : '🔄'
              }{' '}
              Refresh
            </button>
          </div>

          {appsError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
              <span>⚠️</span><span>{appsError}</span>
            </div>
          )}

          {appsMessage && !appsError && (
            <p role="status" className="text-xs text-emerald-700">{appsMessage}</p>
          )}

          {appsLoading && (
            <div className="flex justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-[3px] border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-500 font-medium">Loading applications…</p>
              </div>
            </div>
          )}

          {!appsLoading && !appsError && applications.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="text-4xl">📭</div>
              <h3 className="text-base font-bold text-slate-900">No applications yet</h3>
              <p className="text-sm text-slate-500">Applications will appear here once candidates apply to your jobs.</p>
            </div>
          )}

          {!appsLoading && applications.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-600">
                  Job
                  <select
                    value={applicationJobFilter}
                    onChange={(event) => setApplicationJobFilter(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All jobs</option>
                    {uniqueApplicationJobs.map((job) => (
                      <option key={job._id} value={job._id}>{job.title}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Application status
                  <select
                    value={applicationStatusFilter}
                    onChange={(event) => setApplicationStatusFilter(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All statuses</option>
                    {APP_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-xs text-slate-500">
                {filteredApplications.length} of {applications.length} application{applications.length !== 1 ? 's' : ''}
              </p>
              {filteredApplications.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                  No applicants match these filters.
                </p>
              )}
              {filteredApplications.map((app) => (
                <div key={app._id} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-bold text-slate-900">{app.candidateName}</p>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[app.status] || 'bg-slate-100 text-slate-600'}`}>
                          {app.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{app.candidateEmail}</p>
                      {app.phone && <p className="text-xs text-slate-400">📞 {app.phone}</p>}
                    </div>

                    {/* Status updater */}
                    <div className="shrink-0">
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusUpdate(app._id, e.target.value)}
                        disabled={statusUpdating === app._id}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white cursor-pointer disabled:opacity-50"
                      >
                        {statusOptionsFor(app.status).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {statusUpdating === app._id && (
                        <p className="text-xs text-slate-400 mt-1 text-right">Saving…</p>
                      )}
                    </div>
                  </div>

                  {/* Job */}
                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100">
                    <span className="font-semibold">Applied for:</span>{' '}
                    {app.job?.title || 'Unknown'} at {app.job?.company || '—'}
                    {app.job?.status === 'closed' && (
                      <span className="ml-2 text-slate-400">(closed)</span>
                    )}
                  </div>

                  {/* Resume / cover letter */}
                  <div className="space-y-2 text-xs">
                    {app.resumeDownloadPath ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-slate-600">📎 {app.resumeFileName || 'Uploaded resume'}</span>
                        {getResumePreviewType(app) === 'pdf' ? (
                          <a
                            href={resumeViewUrl(app.resumeDownloadPath)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-blue-600 hover:text-blue-700"
                          >
                            View Resume
                          </a>
                        ) : getResumePreviewType(app) === 'docx' ? (
                          <button
                            type="button"
                            onClick={() => handleResumePreview(app)}
                            disabled={resumePreviewingId === app._id}
                            className="font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                          >
                            {resumePreviewingId === app._id ? 'Loading preview…' : 'View Resume'}
                          </button>
                        ) : (
                          <span className="text-slate-500">Preview unavailable for this file.</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResumeDownload(app)}
                          disabled={resumeDownloadingId === app._id}
                          className="font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          {resumeDownloadingId === app._id ? 'Downloading…' : 'Download Resume'}
                        </button>
                        {resumeDownloadErrors[app._id] && (
                          <p role="alert" className="w-full text-rose-600">
                            {resumeDownloadErrors[app._id]}
                          </p>
                        )}
                        {resumePreviewError.startsWith(`${app._id}:`) && (
                          <p role="alert" className="w-full text-rose-600">{resumePreviewError.slice(app._id.length + 2)}</p>
                        )}
                      </div>
                    ) : isSafeResumeUrl(app.resumeUrl) ? (
                      <a
                        href={app.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        🔗 Resume / Portfolio
                      </a>
                    ) : (
                      <p className="text-slate-500">No resume provided.</p>
                    )}
                    {app.coverLetter && (
                      <details className="group">
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium select-none">
                          📄 Cover Letter
                        </summary>
                        <p className="mt-2 p-3 bg-slate-50 rounded-lg text-slate-700 leading-relaxed border border-slate-100 whitespace-pre-wrap">
                          {app.coverLetter}
                        </p>
                      </details>
                    )}
                    {app.relevantExperience && (
                      <details className="group">
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium select-none">
                          💼 Relevant Experience
                        </summary>
                        <p className="mt-2 p-3 bg-slate-50 rounded-lg text-slate-700 leading-relaxed border border-slate-100 whitespace-pre-wrap">
                          {app.relevantExperience}
                        </p>
                      </details>
                    )}
                  </div>

                  {app.interview?.scheduledAt && !INTERVIEW_SCHEDULABLE_STATUSES.includes(app.status) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                      <p className="font-semibold text-slate-700">
                        {['Rejected', 'Hired'].includes(app.status) || app.interview.status === 'cancelled'
                          ? 'Interview cancelled'
                          : 'Scheduled interview'}
                      </p>
                      <p className="text-slate-600">
                        {new Date(app.interview.scheduledAt).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                      {app.interview.meetingDetails && (
                        <p className="text-slate-600 break-words">{app.interview.meetingDetails}</p>
                      )}
                    </div>
                  )}

                  {INTERVIEW_SCHEDULABLE_STATUSES.includes(app.status) && (
                    <form
                  aria-label={`Interview Scheduling for ${app.candidateName}`}
                  onSubmit={(event) => handleInterviewSchedule(event, app._id)}
                  className="space-y-3 border-t border-slate-100 pt-4"
                    >
                  <h3 className="text-sm font-semibold text-slate-800">Interview Scheduling</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-slate-600">
                      Interview Date
                      <input
                        name="interviewDate"
                        type="date"
                        required
                        defaultValue={toDateTimeLocal(app.interview?.scheduledAt).slice(0, 10)}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Interview Time
                      <input
                        name="interviewTime"
                        type="time"
                        required
                        defaultValue={toDateTimeLocal(app.interview?.scheduledAt).slice(11, 16)}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-medium text-slate-600">
                    Interview Details / Instructions
                    <textarea
                      name="meetingDetails"
                      rows={5}
                      maxLength={1000}
                      defaultValue={app.interview?.meetingDetails || ''}
                      placeholder="Share the platform and meeting link or location, what the candidate should prepare, and any other joining instructions."
                      className="mt-1 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <span className="mt-1 block font-normal text-slate-500">
                      Include a Google Meet, Zoom, or Teams link, an in-person location, preparation notes, or other important information.
                    </span>
                  </label>
                  <button
                    type="submit"
                    disabled={interviewUpdating === app._id}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {interviewUpdating === app._id ? 'Saving…' : app.interview?.scheduledAt ? 'Update Interview' : 'Schedule Interview'}
                  </button>
                    </form>
                  )}

                  <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
                    Submitted {new Date(app.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      </div>
    </>
  );
}

export default RecruiterDashboard;
