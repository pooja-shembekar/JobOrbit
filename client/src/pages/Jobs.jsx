import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch, readApiResponse } from '../lib/api';
import { formatSalary } from '../lib/salary';

const JOB_TYPE_OPTIONS = [
  { value: '',           label: 'All Types' },
  { value: 'full-time',  label: 'Full-Time' },
  { value: 'part-time',  label: 'Part-Time' },
  { value: 'contract',   label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'remote',     label: 'Remote' },
  { value: 'freelance',  label: 'Freelance' },
];

const EXP_OPTIONS = [
  { value: '',          label: 'All Levels' },
  { value: 'entry',     label: 'Entry Level' },
  { value: 'mid',       label: 'Mid Level' },
  { value: 'senior',    label: 'Senior' },
  { value: 'lead',      label: 'Lead' },
  { value: 'executive', label: 'Executive' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'title',  label: 'Title A–Z' },
  { value: 'salary-asc', label: 'Salary: Low to High' },
  { value: 'salary-desc', label: 'Salary: High to Low' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'design', label: 'Design' },
  { value: 'product', label: 'Product' },
  { value: 'data', label: 'Data' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'customer-support', label: 'Customer Support' },
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'human-resources', label: 'Human Resources' },
  { value: 'other', label: 'Other' },
];

const WORK_MODE_OPTIONS = [
  { value: '', label: 'Any Work Mode' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

const TYPE_LABEL = {
  'full-time': 'Full-Time', 'part-time': 'Part-Time', contract: 'Contract',
  internship: 'Internship', remote: 'Remote', freelance: 'Freelance',
};
const EXP_LABEL = {
  entry: 'Entry Level', mid: 'Mid Level', senior: 'Senior',
  lead: 'Lead', executive: 'Executive',
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

function JobCardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-3 animate-pulse">
      <div className="h-5 bg-slate-200 rounded w-2/3" />
      <div className="h-4 bg-slate-100 rounded w-1/3" />
      <div className="h-4 bg-slate-100 rounded w-full" />
      <div className="h-4 bg-slate-100 rounded w-5/6" />
      <div className="flex gap-2 pt-1">
        <div className="h-6 w-20 bg-slate-100 rounded-md" />
        <div className="h-6 w-16 bg-slate-100 rounded-md" />
        <div className="h-6 w-24 bg-slate-100 rounded-md" />
      </div>
    </div>
  );
}

function Jobs() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = useRef(Math.max(1, Number(searchParams.get('page')) || 1));
  const hasFetchedInitialPage = useRef(false);
  const isRecruiter = isAuthenticated && user?.role === 'recruiter';
  const isCandidate = isAuthenticated && user?.role === 'candidate';

  const [jobs,    setJobs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(Math.max(1, Number(searchParams.get('page')) || 1));
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [search,   setSearch]   = useState(searchParams.get('search') || '');
  const [jobType,  setJobType]  = useState(searchParams.get('jobType') || '');
  const [expLevel, setExpLevel] = useState(searchParams.get('experienceLevel') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [workMode, setWorkMode] = useState(searchParams.get('workMode') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [minSalary, setMinSalary] = useState(searchParams.get('minSalary') || '');
  const [maxSalary, setMaxSalary] = useState(searchParams.get('maxSalary') || '');
  const [sort,     setSort]     = useState(searchParams.get('sort') || 'newest');

  // Debounced search term to avoid firing on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  const [savedJobIds, setSavedJobIds] = useState([]);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (authLoading || !isCandidate) return;
    let active = true;
    apiFetch('/jobs/saved')
      .then(async (response) => {
        const data = await readApiResponse(response, 'Saved jobs');
        if (active) setSavedJobIds(data.jobs.map((job) => job._id));
      })
      .catch((error) => { if (active) setSaveError(error.message); });
    return () => { active = false; };
  }, [authLoading, isCandidate]);

  const fetchJobs = useCallback(async (pg = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '12', sort });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (jobType)         params.set('jobType', jobType);
      if (expLevel)        params.set('experienceLevel', expLevel);
      if (category)        params.set('category', category);
      if (workMode)        params.set('workMode', workMode);
      if (location.trim()) params.set('location', location.trim());
      if (minSalary !== '') params.set('minSalary', minSalary);
      if (maxSalary !== '') params.set('maxSalary', maxSalary);

      setSearchParams(params, { replace: true });

      const res  = await apiFetch(`/jobs/public?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load jobs.');

      setJobs(data.jobs);
      setTotal(data.total);
      setPages(data.pages);
      setPage(pg);
    } catch (err) {
      setError(err.message || 'Network error — could not load jobs.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, jobType, expLevel, category, workMode, location, minSalary, maxSalary, sort, setSearchParams]);

  // Re-fetch when any filter changes; reset to page 1
  useEffect(() => {
    if (!hasFetchedInitialPage.current) {
      hasFetchedInitialPage.current = true;
      fetchJobs(initialPage.current);
      return;
    }
    fetchJobs(1);
  }, [fetchJobs]);

  const clearFilters = () => {
    setSearch(''); setJobType(''); setExpLevel(''); setCategory(''); setWorkMode('');
    setLocation(''); setMinSalary(''); setMaxSalary(''); setSort('newest');
  };
  const hasFilters = search || jobType || expLevel || category || workMode || location
    || minSalary || maxSalary || sort !== 'newest';

  const toggleSavedJob = async (jobId) => {
    setSaveError('');
    const isSaved = savedJobIds.includes(jobId);
    try {
      const response = await apiFetch(`/jobs/${jobId}/save`, {
        method: isSaved ? 'DELETE' : 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not update saved jobs.');
      setSavedJobIds((previous) => isSaved
        ? previous.filter((savedId) => savedId !== jobId)
        : [...previous, jobId]);
    } catch (error) {
      setSaveError(error.message || 'Could not update saved jobs.');
    }
  };

  const handleApply = (jobId) => {
    if (isRecruiter) return; // button is hidden for recruiters
    navigate(`/jobs/${jobId}/apply`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Explore Opportunities</h1>
        <p className="text-slate-600 text-sm sm:text-base">
          Find your next role on{' '}
          <span className="font-semibold text-blue-600">JobOrbit</span> — your career, your next move.
        </p>
      </div>

      {/* Recruiter Notice */}
      {isRecruiter && (
        <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>🛡️</span>
            <span>
              <strong>Recruiter Mode:</strong> Viewing open listings. Application submissions are disabled for recruiter accounts.
            </span>
          </div>
          <Link
            to="/recruiter/dashboard"
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            Recruiter Dashboard →
          </Link>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by title, company, or skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 bg-white">
            {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={workMode} onChange={(event) => setWorkMode(event.target.value)} aria-label="Work mode" className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 bg-white">
            {WORK_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {/* Job Type */}
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          >
            {JOB_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Experience Level */}
          <select
            value={expLevel}
            onChange={(e) => setExpLevel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          >
            {EXP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Location */}
          <input
            type="text"
            placeholder="Location…"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[120px]"
          />

          <input type="number" min="0" value={minSalary} onChange={(event) => setMinSalary(event.target.value)} placeholder="Min salary" aria-label="Minimum salary" className="w-28 px-3 py-2 rounded-lg border border-slate-300 text-xs" />
          <input type="number" min="0" value={maxSalary} onChange={(event) => setMaxSalary(event.target.value)} placeholder="Max salary" aria-label="Maximum salary" className="w-28 px-3 py-2 rounded-lg border border-slate-300 text-xs" />

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 transition-colors cursor-pointer"
            >
              Clear filters ✕
            </button>
          )}
        </div>

        {/* Result count */}
        {!loading && (
          <p className="text-xs text-slate-500">
            {total === 0 ? 'No jobs found' : `${total} job${total !== 1 ? 's' : ''} found`}
            {debouncedSearch && <> for "<span className="font-semibold text-slate-700">{debouncedSearch}</span>"</>}
          </p>
        )}
      </div>

      {saveError && <p role="alert" className="text-sm text-rose-700">{saveError}</p>}

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => fetchJobs(page)}
              className="mt-1 text-xs font-semibold underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <JobCardSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && jobs.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <div className="text-4xl">🔍</div>
          <h3 className="text-base font-bold text-slate-900">No jobs found</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {hasFilters
              ? 'Try adjusting or clearing your filters.'
              : 'No open positions are available right now. Check back soon!'}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Job cards */}
      {!loading && !error && jobs.length > 0 && (
        <div className="space-y-4">
          {jobs.map((job) => {
            const salary = formatSalary(job.salaryMin, job.salaryMax);
            return (
              <div
                key={job._id}
                className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all space-y-3"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/jobs/${job._id}`}
                      className="text-lg font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1"
                    >
                      {job.title}
                    </Link>
                    <p className="text-sm font-medium text-slate-600 mt-0.5">{job.company}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(job.createdAt)}</span>
                  {isCandidate && (
                    <button
                      type="button"
                      onClick={() => toggleSavedJob(job._id)}
                      aria-label={savedJobIds.includes(job._id) ? 'Remove saved job' : 'Save job'}
                      aria-pressed={savedJobIds.includes(job._id)}
                      className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {savedJobIds.includes(job._id) ? 'Saved' : 'Save job'}
                    </button>
                  )}
                </div>

                {/* Description preview */}
                <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                  {job.description}
                </p>

                {/* Meta chips */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
                    📍 {job.location}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium">
                    💼 {TYPE_LABEL[job.jobType] || job.jobType}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-medium">
                    🎯 {EXP_LABEL[job.experienceLevel] || job.experienceLevel}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-cyan-50 text-cyan-800 font-medium">
                    {job.workMode || 'onsite'}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 font-medium">
                    {job.category || 'other'}
                  </span>
                  {salary && (
                    <span className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 font-medium">
                      💰 {salary}
                    </span>
                  )}
                </div>

                {/* Skills */}
                {job.skills && job.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {job.skills.slice(0, 6).map((skill, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                        {skill}
                      </span>
                    ))}
                    {job.skills.length > 6 && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-xs rounded-full">
                        +{job.skills.length - 6}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                  <Link
                    to={`/jobs/${job._id}`}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    View Details →
                  </Link>

                  {isRecruiter ? (
                    <span className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
                      Recruiter View
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleApply(job._id)}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Apply Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                type="button"
                onClick={() => fetchJobs(page - 1)}
                disabled={page <= 1}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-500">Page {page} of {pages}</span>
              <button
                type="button"
                onClick={() => fetchJobs(page + 1)}
                disabled={page >= pages}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Jobs;
