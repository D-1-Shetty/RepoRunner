import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RepositoryDetails from "./pages/RepositoryDetails";
import DeploymentDetails from "./pages/DeploymentDetails";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/dashboard" element={<Dashboard />} />

      <Route
        path="/repositories/:id"
        element={<RepositoryDetails />}
      />

      <Route
        path="/deployments/:id"
        element={<DeploymentDetails />}
      />
    </Routes>
  );
}

export default App;