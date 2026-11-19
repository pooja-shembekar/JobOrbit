import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch, readApiResponse } from '../lib/api';

const STATUS_STYLES = {
  'Applied':      'bg-blue-100 text-blue-700',
  'Submitted':    'bg-blue-100 text-blue-700',
  'Under Review': 'bg-amber-100 text-amber-700',
  'Shortlisted':  'bg-purple-100 text-purple-700',
  'Interview':    'bg-cyan-100 text-cyan-700',
  'Rejected':     'bg-rose-100 text-rose-600',
  'Hired':        'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS = { Submitted: 'Applied' };

const isSafeResumeUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return '1 day ago';
  if (d < 30) return `${d} days ago`;
  if (d < 60) return '1 month ago';
  return `${Math.floor(d / 30)} months ago`;
}

function formatTimestamp(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function MyApplications() {
  const { user, loading: authLoading } = useAuth();

  const [applications, setApplications] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [skillsText, setSkillsText] = useState(user?.skills?.join(', ') || '');
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [skillsMessage, setSkillsMessage] = useState('');

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await apiFetch('/applications/my-applications', {
        signal: AbortSignal.timeout(15000),
      });
      const data = await readApiResponse(res, 'Applications');
      setApplications(data.applications);
    } catch (err) {
      setError(err.name === 'TimeoutError'
        ? 'Loading applications timed out. Check your connection and retry.'
        : err.message || 'Network error — could not load your applications.');
    } finally {
      setLoading(false);
    }
  }, [authLoading]);

  useEffect(() => {
    if (!authLoading) fetchApplications();
  }, [authLoading, fetchApplications]);

  const saveSkills = async (event) => {
    event.preventDefault();
    setSkillsSaving(true);
    setSkillsMessage('');
    try {
      const response = await apiFetch('/auth/skills', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ skills: skillsText.split(',').map((skill) => skill.trim()).filter(Boolean) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not save skills.');
      setSkillsMessage('Skills saved. You can now compare them with job requirements.');
    } catch (saveError) {
      setSkillsMessage(saveError.message || 'Could not save skills.');
    } finally {
      setSkillsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">My Applications</h1>
          <p className="text-sm text-slate-500">Track all your submitted job applications.</p>
        </div>
        <button
          type="button"
          onClick={fetchApplications}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading
            ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            : '🔄'
          }{' '}
          Refresh
        </button>
      </div>

      <form onSubmit={saveSkills} className="border-y border-slate-200 py-5 space-y-3">
        <div>
          <label htmlFor="candidateSkills" className="block text-sm font-semibold text-slate-800">Saved skills</label>
          <p className="mt-1 text-xs text-slate-500">Enter up to 50 skills, separated by commas.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="candidateSkills"
            value={skillsText}
            onChange={(event) => setSkillsText(event.target.value)}
            maxLength={2600}
            placeholder="React, Node.js, MongoDB"
            className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <button type="submit" disabled={skillsSaving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
            {skillsSaving ? 'Saving…' : 'Save skills'}
          </button>
        </div>
        {skillsMessage && <p role="status" className="text-xs text-slate-600">{skillsMessage}</p>}
      </form>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse space-y-3">
              <div className="h-5 bg-slate-200 rounded w-2/3" />
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="flex gap-2">
                <div className="h-6 w-20 bg-slate-100 rounded-full" />
                <div className="h-6 w-24 bg-slate-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p>{error}</p>
            <button type="button" onClick={fetchApplications} className="text-xs font-semibold underline cursor-pointer mt-1">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && applications.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
          <div className="text-4xl">📋</div>
          <h3 className="text-base font-bold text-slate-900">No applications yet</h3>
          <p className="text-sm text-slate-500">Browse open jobs and hit Apply Now to get started.</p>
          <Link
            to="/jobs"
            className="inline-block mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Browse Jobs →
          </Link>
        </div>
      )}

      {/* Applications list */}
      {!loading && !error && applications.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {applications.length} application{applications.length !== 1 ? 's' : ''} submitted
          </p>
          {applications.map((app) => (
            <div
              key={app._id}
              className="bg-white rounded-xl border border-slate-200 hover:border-blue-200 shadow-xs p-5 sm:p-6 space-y-3 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-0.5">
                  {app.job ? (
                    <Link
                      to={`/jobs/${app.job._id}`}
                      className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors"
                    >
                      {app.job.title}
                    </Link>
                  ) : (
                    <p className="text-base font-bold text-slate-500 italic">Job no longer available</p>
                  )}
                  <p className="text-sm text-slate-600 font-medium">{app.job?.company || '—'}</p>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                    STATUS_STYLES[app.status] || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Current status: {STATUS_LABELS[app.status] || app.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                {app.job?.location && (
                  <span>📍 {app.job.location}</span>
                )}
                {app.job?.jobType && (
                  <span>💼 {app.job.jobType}</span>
                )}
                <span>📅 Applied {timeAgo(app.createdAt)}</span>
              </div>

              {isSafeResumeUrl(app.resumeUrl) && (
                <a
                  href={app.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  🔗 View Resume / Portfolio
                </a>
              )}

              <ol aria-label="Application status history" className="border-l border-slate-200 pl-4 space-y-4">
                {[...(app.statusHistory || [])]
                  .sort((left, right) => new Date(left.changedAt).getTime() - new Date(right.changedAt).getTime())
                  .map((event, index) => (
                  <li key={`${event.status}-${event.changedAt}-${index}`} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
                    <p className="text-xs font-semibold text-slate-800">{STATUS_LABELS[event.status] || event.status}</p>
                    <p className="text-xs text-slate-500">
                      {event.actorRole === 'candidate' && 'Application submitted'}
                      {event.actorRole === 'recruiter' && 'Updated by the hiring team'}
                      {event.actorRole === 'legacy' && 'Status recorded before tracking history was enabled'}
                      {' · '}{formatTimestamp(event.changedAt)}
                    </p>
                  </li>
                ))}
              </ol>

              {app.interview?.scheduledAt && (
                <section
                  aria-label={app.interview.status === 'cancelled' || ['Rejected', 'Hired'].includes(app.status) ? 'Cancelled interview' : 'Scheduled interview'}
                  className={`rounded-lg border p-4 space-y-1 ${app.interview.status === 'cancelled' || ['Rejected', 'Hired'].includes(app.status) ? 'border-slate-300 bg-slate-50' : 'border-cyan-200 bg-cyan-50'}`}
                >
                  <h3 className={`text-xs font-semibold ${app.interview.status === 'cancelled' || ['Rejected', 'Hired'].includes(app.status) ? 'text-slate-700' : 'text-cyan-900'}`}>
                    {app.interview.status === 'cancelled' || ['Rejected', 'Hired'].includes(app.status) ? 'Interview cancelled' : 'Interview scheduled'}
                  </h3>
                  <p className={`text-xs ${app.interview.status === 'cancelled' || ['Rejected', 'Hired'].includes(app.status) ? 'text-slate-600' : 'text-cyan-900'}`}>
                    {formatTimestamp(app.interview.scheduledAt)}
                  </p>
                  {app.interview.meetingDetails && (
                    <p className={`text-xs break-words ${app.interview.status === 'cancelled' || ['Rejected', 'Hired'].includes(app.status) ? 'text-slate-600' : 'text-cyan-900'}`}>{app.interview.meetingDetails}</p>
                  )}
                </section>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyApplications;
