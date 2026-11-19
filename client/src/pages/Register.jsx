import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch, readApiResponse } from '../lib/api';

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'candidate',
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errorMessage) setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (formData.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch('/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await readApiResponse(response, 'Registration');
      if (!data.user?._id || !data.user?.role) throw new Error('Registration returned an incomplete account response.');
      login(data.user);
      navigate(data.user.role === 'recruiter' ? '/recruiter/dashboard' : '/jobs', { replace: true });
    } catch (err) {
      setErrorMessage(err instanceof TypeError
        ? 'Could not reach the registration service. Check that the backend is running.'
        : err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg mx-auto shadow-sm">
            JO
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create an Account</h1>
          <p className="text-sm text-slate-600">
            Join <span className="font-semibold text-blue-600">JobOrbit</span> &mdash; your career, your next move.
          </p>
        </div>

        {/* Real Error Message */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Select Your Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'candidate' })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                  formData.role === 'candidate'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Candidate (Job Seeker)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'recruiter' })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                  formData.role === 'recruiter'
                    ? 'border-purple-600 bg-purple-50 text-purple-700 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Recruiter (Employer)
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-xs font-semibold text-slate-700 uppercase mb-1"
            >
              Full Name
            </label>
            <input
              id="name"
              type="text"
              name="name"
              autoComplete="name"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Alex Johnson"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-slate-700 uppercase mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-slate-700 uppercase mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              value={formData.password}
              onChange={handleChange}
              placeholder="Minimum 6 characters"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-sm cursor-pointer disabled:opacity-50"
          >
            {loading
              ? 'Creating Account...'
              : `Register as ${formData.role === 'candidate' ? 'Candidate' : 'Recruiter'}`}
          </button>
        </form>
        <p className="text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 font-semibold hover:underline">
            Sign in instead
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
