import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'remote', 'freelance'];
const EXP_LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'];
const JOB_CATEGORIES = ['engineering', 'design', 'product', 'data', 'sales', 'marketing', 'customer-support', 'operations', 'finance', 'human-resources', 'other'];

const LABEL = {
  'full-time': 'Full-Time',
  'part-time': 'Part-Time',
  contract: 'Contract',
  internship: 'Internship',
  remote: 'Remote',
  entry: 'Entry Level',
  mid: 'Mid Level',
  senior: 'Senior',
  lead: 'Lead',
  executive: 'Executive',
};

/**
 * EditJobModal
 * Props:
 *   job      – the job object to edit (populated from parent)
 *   onSave   – callback(updatedJob) called after successful save
 *   onClose  – callback to close the modal without saving
 */
function EditJobModal({ job, onSave, onClose }) {
  const [form, setForm] = useState({
    title: '',
    company: '',
    description: '',
    location: '',
    category: 'other',
    workMode: 'onsite',
    jobType: 'full-time',
    experienceLevel: 'mid',
    salaryMin: '',
    salaryMax: '',
    skills: '',
    status: 'open',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Populate form from the job prop on mount / when job changes
  useEffect(() => {
    if (job) {
      setForm({
        title: job.title || '',
        company: job.company || '',
        description: job.description || '',
        location: job.location || '',
        category: job.category || 'other',
        workMode: job.workMode || 'onsite',
        jobType: job.jobType || 'full-time',
        experienceLevel: job.experienceLevel || 'mid',
        salaryMin: job.salaryMin !== null && job.salaryMin !== undefined ? String(job.salaryMin) : '',
        salaryMax: job.salaryMax !== null && job.salaryMax !== undefined ? String(job.salaryMax) : '',
        skills: Array.isArray(job.skills) ? job.skills.join(', ') : '',
        status: job.status || 'open',
      });
    }
  }, [job]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    if (!form.title.trim() || !form.company.trim() || !form.description.trim() || !form.location.trim()) {
      setError('Title, company, description, and location are required.');
      return;
    }
    if (form.description.trim().length < 30) {
      setError('Description must be at least 30 characters.');
      return;
    }
    const minVal = form.salaryMin !== '' ? Number(form.salaryMin) : null;
    const maxVal = form.salaryMax !== '' ? Number(form.salaryMax) : null;
    if (minVal !== null && isNaN(minVal)) { setError('Minimum salary must be a valid number.'); return; }
    if (maxVal !== null && isNaN(maxVal)) { setError('Maximum salary must be a valid number.'); return; }
    if (minVal !== null && maxVal !== null && maxVal < minVal) {
      setError('Maximum salary must be ≥ minimum salary.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(`/jobs/${job._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          salaryMin: form.salaryMin !== '' ? Number(form.salaryMin) : null,
          salaryMax: form.salaryMax !== '' ? Number(form.salaryMax) : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update job listing.');
      }

      onSave(data.job);
    } catch (err) {
      setError(err.message || 'Network error — could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Edit Job Listing</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer text-lg"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Title + Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Job Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Senior Frontend Engineer"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Company <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="company"
                value={form.company}
                onChange={handleChange}
                placeholder="e.g. Acme Corp"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Location <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="e.g. New York, NY or Remote"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Job Type + Experience Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-category" className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category</label>
              <select id="edit-category" name="category" value={form.category} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white">
                {JOB_CATEGORIES.map((category) => <option key={category} value={category}>{LABEL[category] || category.replaceAll('-', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="edit-workMode" className="block text-xs font-semibold text-slate-700 uppercase mb-1">Work Mode</label>
              <select id="edit-workMode" name="workMode" value={form.workMode} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white">
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </div>
          </div>

          {/* Job Type + Experience Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Job Type <span className="text-rose-500">*</span>
              </label>
              <select
                name="jobType"
                value={form.jobType}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
              >
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>{LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Experience Level <span className="text-rose-500">*</span>
              </label>
              <select
                name="experienceLevel"
                value={form.experienceLevel}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
              >
                {EXP_LEVELS.map((l) => (
                  <option key={l} value={l}>{LABEL[l]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Salary Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Min Salary (INR ₹) <span className="text-slate-400 normal-case font-normal">optional</span>
              </label>
              <input
                type="number"
                name="salaryMin"
                value={form.salaryMin}
                onChange={handleChange}
                placeholder="e.g. ₹300000"
                min="0"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Max Salary (INR ₹) <span className="text-slate-400 normal-case font-normal">optional</span>
              </label>
              <input
                type="number"
                name="salaryMax"
                value={form.salaryMax}
                onChange={handleChange}
                placeholder="e.g. ₹600000"
                min="0"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Listing Status
            </label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Job Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={5}
              placeholder="Describe the role, responsibilities, and what a great candidate looks like…"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
            />
            <p className="text-xs text-slate-400 mt-1">{form.description.length} / 5000 characters (min 30)</p>
          </div>

          {/* Required Skills */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Required Skills <span className="text-slate-400 normal-case font-normal">comma-separated</span>
            </label>
            <input
              type="text"
              name="skills"
              value={form.skills}
              onChange={handleChange}
              placeholder="e.g. React, Node.js, TypeScript, MongoDB"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditJobModal;
