import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../lib/api';
import { formatSalary } from '../lib/salary';

const TYPE_LABEL = {
  'full-time': 'Full-Time', 'part-time': 'Part-Time', contract: 'Contract',
  internship: 'Internship', remote: 'Remote', freelance: 'Freelance',
};
const EXP_LABEL = {
  entry: 'Entry Level', mid: 'Mid Level', senior: 'Senior', lead: 'Lead', executive: 'Executive',
};

function JobDetail() {
  const { jobId } = useParams();
  const navigate  = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isRecruiter = isAuthenticated && user?.role === 'recruiter';

  const [job,     setJob]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [match, setMatch] = useState(null);
  const [matchError, setMatchError] = useState('');
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    const fetchJob = async () => {
      setLoading(true);
      setError('');
      try {
        const res  = await apiFetch(`/jobs/public/${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Job not found.');
        setJob(data.job);
      } catch (err) {
        setError(err.message || 'Failed to load job details.');
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [jobId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4 animate-pulse">
          <div className="h-7 bg-slate-200 rounded w-2/3" />
          <div className="h-5 bg-slate-100 rounded w-1/3" />
          <div className="flex gap-2 pt-2">
            {[1,2,3].map(i=><div key={i} className="h-7 w-24 bg-slate-100 rounded-md" />)}
          </div>
          <div className="space-y-2 pt-4">
            {[1,2,3,4].map(i=><div key={i} className={`h-4 bg-slate-100 rounded w-${i%2===0?'5/6':'full'}`}/>)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-4xl">❌</div>
        <h2 className="text-xl font-bold text-slate-900">Job Not Found</h2>
        <p className="text-sm text-slate-500">{error || 'This job listing does not exist or has been removed.'}</p>
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          ← Browse All Jobs
        </Link>
      </div>
    );
  }

  const salary = formatSalary(job.salaryMin, job.salaryMax);
  const isClosed = job.status === 'closed';

  const checkMatch = async () => {
    setMatchLoading(true);
    setMatchError('');
    try {
      const response = await apiFetch(`/jobs/${job._id}/match`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not compare skills.');
      setMatch(data.match);
    } catch (matchRequestError) {
      setMatchError(matchRequestError.message || 'Could not compare skills.');
    } finally {
      setMatchLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 flex items-center gap-1.5">
        <Link to="/jobs" className="hover:text-blue-600 transition-colors">Browse Jobs</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">{job.title}</span>
      </nav>

      {/* Job header card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-extrabold text-slate-900">{job.title}</h1>
              {isClosed && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500 rounded-full">
                  Closed
                </span>
              )}
            </div>
            <p className="text-base font-semibold text-slate-700">{job.company}</p>
            {job.postedBy?.name && (
              <p className="text-xs text-slate-400">Posted by {job.postedBy.name}</p>
            )}
          </div>

          {/* Apply button */}
          <div className="shrink-0">
            {isRecruiter ? (
              <span className="inline-block px-4 py-2 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
                Recruiter View
              </span>
            ) : isClosed ? (
              <span className="inline-block px-4 py-2 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
                Applications Closed
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/jobs/${job._id}/apply`)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                Apply Now →
              </button>
            )}
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-medium">
            📍 {job.location}
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium">
            💼 {TYPE_LABEL[job.jobType] || job.jobType}
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium">
            🎯 {EXP_LABEL[job.experienceLevel] || job.experienceLevel}
          </span>
          {salary && (
            <span className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-medium">
              💰 {salary}
            </span>
          )}
        </div>

        {/* Skills */}
        {job.skills && job.skills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Required Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {job.skills.map((skill, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {isAuthenticated && user?.role === 'candidate' && (
          <div className="border-t border-slate-100 pt-4">
            <button type="button" onClick={checkMatch} disabled={matchLoading} className="text-sm font-semibold text-blue-700 disabled:opacity-60">
              {matchLoading ? 'Comparing skills…' : 'Compare with my saved skills'}
            </button>
            {matchError && <p role="alert" className="mt-2 text-xs text-rose-600">{matchError}</p>}
            {match && (
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p><strong>{match.score}% skills overlap</strong> <span className="text-xs text-slate-500">({match.method})</span></p>
                <p className="text-xs">{match.explanation}</p>
                <p className="text-xs text-slate-500">Matched: {match.matchedSkills.join(', ') || 'None'}</p>
                <p className="text-xs text-slate-500">Missing: {match.missingSkills.join(', ') || 'None'}</p>
                <p className="text-xs text-slate-400">{match.disclaimer}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Job Description</h2>
        <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
          {job.description}
        </div>
      </div>

      {/* Bottom CTA */}
      {!isRecruiter && !isClosed && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-slate-900 text-sm">Interested in this role?</p>
            <p className="text-xs text-slate-600 mt-0.5">Submit your application — it takes less than a minute.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/jobs/${job._id}/apply`)}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shrink-0"
          >
            Apply Now →
          </button>
        </div>
      )}

      <div className="text-center">
        <Link to="/jobs" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
          ← Back to Browse Jobs
        </Link>
      </div>
    </div>
  );
}

export default JobDetail;
