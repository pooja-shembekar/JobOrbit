import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../lib/api';

function SavedJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSavedJobs = useCallback(async () => {
    setError('');
    try {
      const response = await apiFetch('/jobs/saved');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load saved jobs.');
      setJobs(data.jobs.filter(Boolean));
    } catch (fetchError) {
      setError(fetchError.message || 'Could not load saved jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSavedJobs(); }, [fetchSavedJobs]);

  const removeSavedJob = async (jobId) => {
    setError('');
    try {
      const response = await apiFetch(`/jobs/${jobId}/save`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not remove saved job.');
      setJobs((previous) => previous.filter((job) => job._id !== jobId));
    } catch (removeError) {
      setError(removeError.message || 'Could not remove saved job.');
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Saved Jobs</h1>
        <p className="mt-1 text-sm text-slate-600">Your bookmarked opportunities.</p>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>{error}</p>
          <button type="button" onClick={() => { setLoading(true); fetchSavedJobs(); }} className="mt-2 font-semibold underline">Retry</button>
        </div>
      )}

      {loading && <p role="status" className="text-sm text-slate-500">Loading saved jobs…</p>}

      {!loading && !error && jobs.length === 0 && (
        <section className="border-y border-slate-200 py-10 text-center space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">No saved jobs yet</h2>
          <p className="text-sm text-slate-500">Save an opportunity from job search to keep it here.</p>
          <Link to="/jobs" className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            Browse jobs
          </Link>
        </section>
      )}

      {!loading && !error && jobs.length > 0 && (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {jobs.map((job) => (
            <li key={job._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-5">
              <div className="min-w-0">
                <Link to={`/jobs/${job._id}`} className="font-semibold text-slate-900 hover:text-blue-700">
                  {job.title}
                </Link>
                <p className="text-sm text-slate-600">{job.company} · {job.location}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {job.workMode || 'onsite'} · {job.jobType} · {job.status === 'closed' ? 'Closed' : 'Open'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeSavedJob(job._id)}
                className="self-start sm:self-center rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Remove saved job
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default SavedJobs;