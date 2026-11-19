import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors hover:text-blue-600 ${
      isActive ? 'text-blue-600 font-semibold' : 'text-slate-600'
    }`;

  const mobileNavLinkClass = ({ isActive }) =>
    `block px-3 py-2 rounded-md text-base font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-600 font-semibold'
        : 'text-slate-700 hover:bg-slate-100 hover:text-blue-600'
    }`;

  const isRecruiter = isAuthenticated && user?.role === 'recruiter';

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              JO
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-slate-900 leading-none">
                JobOrbit
              </span>
              <span className="text-[10px] text-slate-500 font-medium tracking-wide">
                PORTAL &amp; TRACKER
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/jobs" className={navLinkClass}>
              Browse Jobs
            </NavLink>

            {/* Candidate-specific link */}
            {isAuthenticated && user?.role === 'candidate' && (
              <NavLink to="/my-applications" className={navLinkClass}>
                My Applications
              </NavLink>
            )}
            {isAuthenticated && user?.role === 'candidate' && (
              <NavLink to="/saved-jobs" className={navLinkClass}>
                Saved Jobs
              </NavLink>
            )}

            {/* Recruiter-specific link */}
            {isRecruiter && (
              <NavLink to="/recruiter/dashboard" className={navLinkClass}>
                Recruiter Dashboard
              </NavLink>
            )}

            <div className="flex items-center space-x-3 ml-4 pl-4 border-l border-slate-200">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      {user?.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        user?.role === 'recruiter'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {user?.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs font-medium text-slate-600 hover:text-rose-600 px-3 py-1.5 border border-slate-300 rounded-lg hover:border-rose-300 transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <>
                  <NavLink
                    to="/login"
                    className="text-sm font-medium text-slate-700 hover:text-blue-600 px-3 py-2 transition-colors"
                  >
                    Sign In
                  </NavLink>
                  <NavLink
                    to="/register"
                    className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm transition-colors"
                  >
                    Get Started
                  </NavLink>
                </>
              )}
            </div>
          </nav>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
          <NavLink
            to="/"
            end
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            Home
          </NavLink>
          <NavLink
            to="/jobs"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            Browse Jobs
          </NavLink>
          {isAuthenticated && user?.role === 'candidate' && (
            <NavLink
              to="/my-applications"
              onClick={() => setMobileMenuOpen(false)}
              className={mobileNavLinkClass}
            >
              My Applications
            </NavLink>
          )}
          {isAuthenticated && user?.role === 'candidate' && (
            <NavLink
              to="/saved-jobs"
              onClick={() => setMobileMenuOpen(false)}
              className={mobileNavLinkClass}
            >
              Saved Jobs
            </NavLink>
          )}
          {isRecruiter && (
            <NavLink
              to="/recruiter/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={mobileNavLinkClass}
            >
              Recruiter Dashboard
            </NavLink>
          )}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            {isAuthenticated ? (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between px-3 py-1">
                  <span className="text-sm font-semibold text-slate-800">{user?.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      user?.role === 'recruiter'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {user?.role}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-center px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <>
                <NavLink
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  Sign In
                </NavLink>
                <NavLink
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                >
                  Get Started
                </NavLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
