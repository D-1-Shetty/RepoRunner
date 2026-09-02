import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Deployments from "./pages/Deployments";
import RepositoryDetails from "./pages/RepositoryDetails";
import DeploymentDetails from "./pages/DeploymentDetails";
import ProtectedRoute from "./routes/ProtectedRoute";
import RunningApplications from "./pages/RunningApplications";
function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/dashboard" element={<Dashboard />} />

      {/* Repositories list reuses the Dashboard's repository functionality. */}
      <Route
        path="/repositories"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/deployments"
        element={
          <ProtectedRoute>
            <Deployments />
          </ProtectedRoute>
        }
      />

      <Route
        path="/repositories/:id"
        element={<RepositoryDetails />}
      />

      <Route
        path="/deployments/:id"
        element={<DeploymentDetails />}
      />

      <Route
        path="/repositories/:id"
        element={
          <ProtectedRoute>
            <RepositoryDetails />
          </ProtectedRoute>
        }
      />
      <Route
  path="/running-applications"
  element={
    <ProtectedRoute>
      <RunningApplications />
    </ProtectedRoute>
  }
/>

      {/* Any unknown path falls back to the dashboard instead of a blank page. */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;