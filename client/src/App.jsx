import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import ApplyJob from './pages/ApplyJob';
import MyApplications from './pages/MyApplications';
import SavedJobs from './pages/SavedJobs';
import Login from './pages/Login';
import Register from './pages/Register';
import RecruiterDashboard from './pages/RecruiterDashboard';

function NotFound() {
  return (
    <div className="max-w-md mx-auto py-24 px-4 text-center space-y-4">
      <h2 className="text-4xl font-extrabold text-slate-900">404</h2>
      <p className="text-slate-600">The page you are looking for does not exist on JobOrbit.</p>
      <Link
        to="/"
        className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        Return to Home
      </Link>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Public Routes */}
          <Route index element={<Home />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:jobId" element={<JobDetail />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />

          {/* Protected Candidate Routes */}
          <Route element={<ProtectedRoute allowedRoles={['candidate']} />}>
            <Route path="jobs/:jobId/apply" element={<ApplyJob />} />
            <Route path="my-applications" element={<MyApplications />} />
            <Route path="saved-jobs" element={<SavedJobs />} />
          </Route>

          {/* Protected Recruiter Routes */}
          <Route element={<ProtectedRoute allowedRoles={['recruiter']} />}>
            <Route path="recruiter/dashboard" element={<RecruiterDashboard />} />
          </Route>

          {/* 404 Route */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
