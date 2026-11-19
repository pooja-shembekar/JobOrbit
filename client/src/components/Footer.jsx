import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 mt-auto border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand info */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-base">
                JO
              </div>
              <span className="text-xl font-bold text-white tracking-tight">JobOrbit</span>
            </div>
            <p className="text-sm text-slate-300 font-medium">
              Job Portal &amp; Application Tracker
            </p>
            <p className="text-sm text-slate-400 max-w-sm italic">
              &ldquo;Your career. Your next move.&rdquo;
            </p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md">
              Connecting qualified candidates with top companies, while streamlining application tracking from submission to hire.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Explore
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/jobs" className="hover:text-white transition-colors">
                  Browse Jobs
                </Link>
              </li>
            </ul>
          </div>

          {/* Account links */}
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Account
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Sign In
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white transition-colors">
                  Create Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} JobOrbit. All rights reserved.</p>
          <p className="text-slate-400 font-medium">Job Portal &amp; Application Tracker</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
