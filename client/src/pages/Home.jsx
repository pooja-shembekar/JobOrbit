import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, apiUrl } from '../lib/api';

function Home() {
  const [backendStatus, setBackendStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkBackend = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/health');
      const data = await response.json();
      setBackendStatus(data);
    } catch (err) {
      setBackendStatus({
        success: false,
        message: 'Could not connect to the JobOrbit API.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackend();
  }, []);

  return (
    <div className="space-y-16 py-12">
      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold tracking-wide uppercase">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
          Job Portal &amp; Application Tracker
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          JobOrbit
        </h1>

        <p className="text-xl sm:text-2xl font-medium text-slate-600 max-w-2xl mx-auto">
          &ldquo;Your career. Your next move.&rdquo;
        </p>

        <p className="text-base sm:text-lg text-slate-500 max-w-2xl mx-auto">
          The all-in-one platform where candidates browse and track applications in real time, and recruiters manage listings and hire top talent.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            to="/jobs"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-700 transition-colors"
          >
            Browse Open Jobs
          </Link>
          <Link
            to="/register"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-white border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
          >
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Role Feature Highlights */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* For Candidates */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xl">
              🎯
            </div>
            <h3 className="text-xl font-bold text-slate-900">For Job Seekers</h3>
            <p className="text-sm text-slate-600">
              Discover opportunities matching your skills and track every stage of your application with transparent status updates.
            </p>
            <ul className="space-y-2 text-sm text-slate-600 pt-2">
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span> Search and filter verified job openings
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span> One-click application process
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span> Real-time application status tracker
              </li>
            </ul>
          </div>

          {/* For Recruiters */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl">
              💼
            </div>
            <h3 className="text-xl font-bold text-slate-900">For Recruiters</h3>
            <p className="text-sm text-slate-600">
              Publish vacancies, manage inbound candidate pipelines, and seamlessly update candidate progress in one clean dashboard.
            </p>
            <ul className="space-y-2 text-sm text-slate-600 pt-2">
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span> Create, edit, and close job postings
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span> Review applicant profiles &amp; qualifications
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span> Update candidate status (Reviewing, Shortlisted, Hired)
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Backend API Health Check Section */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-semibold text-slate-800">
              System Health &amp; Backend Connectivity
            </h3>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                backendStatus?.success
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {loading
                ? 'Checking...'
                : backendStatus?.success
                ? 'Backend Online'
                : 'Backend Offline'}
            </span>
          </div>

          <div className="text-sm space-y-1.5 text-slate-600">
            <p>
              <strong className="text-slate-800">Endpoint:</strong>{' '}
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                GET {apiUrl('/health')}
              </code>
            </p>
            {backendStatus && (
              <>
                <p>
                  <strong className="text-slate-800">Response Message:</strong>{' '}
                  {backendStatus.message}
                </p>
                {backendStatus.timestamp && (
                  <p className="text-xs text-slate-500">
                    <strong className="text-slate-700">Server Timestamp:</strong>{' '}
                    {backendStatus.timestamp}
                  </p>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={checkBackend}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Testing Connection...' : 'Recheck Backend Health'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default Home;
