import { useEffect, useState } from "react";

import DashboardLayout from "../layouts/DashboardLayout";
import {
  getRepositories,
  stopApplication,
  restartApplication,
} from "../api/repository.api";

const STATUS_PILL_CLASSES = {
  RUNNING: "bg-green-100 text-green-700",
  STOPPED: "bg-gray-200 text-gray-700",
  FAILED: "bg-red-100 text-red-700",
};

export default function RunningApplications() {
  const [applications, setApplications] = useState([]);
  const [busyKey, setBusyKey] = useState(null);

  const fetchApplications = async () => {
    try {
      const data = await getRepositories();

      // Flatten every repository's applications[] into a single list and
      // keep the ones that have been deployed (running or stopped).
      const deployedApplications = (data.repositories ?? []).flatMap(
        (repository) =>
          (repository.applications ?? [])
            .filter((application) =>
              ["RUNNING", "STOPPED", "FAILED"].includes(application.status)
            )
            .map((application) => ({
              repositoryId: repository._id,
              repositoryName: repository.name,
              name: application.name,
              framework: application.framework,
              projectType: application.projectType,
              status: application.status,
              hostPort: application.docker?.hostPort,
              containerPort: application.docker?.containerPort,
            }))
      );

      setApplications(deployedApplications);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchApplications();

    // Pick up backend status-sync changes (e.g. a container that crashed or
    // was stopped outside RepoRunner) without a manual refresh or redeploy.
    const timer = setInterval(fetchApplications, 20000);

    return () => clearInterval(timer);
  }, []);

  const runAction = async (application, action) => {
    const key = `${application.repositoryId}-${application.name}`;

    try {
      setBusyKey(key);

      await action(application.repositoryId, application.name);

      // Refresh so the displayed status reflects the new container state.
      await fetchApplications();
    } catch (error) {
      console.error(error);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">
        Running Applications
      </h1>

      <div className="space-y-6">
        {applications.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            No running applications found.
          </div>
        ) : (
          applications.map((application, index) => {
            const key = `${application.repositoryId}-${application.name}`;
            const isRunning = application.status === "RUNNING";
            const isBusy = busyKey === key;
            const canOpen = isRunning && Boolean(application.hostPort);

            return (
              <div
                key={`${key}-${index}`}
                className="bg-white rounded-xl shadow p-6 flex justify-between items-center"
              >
                <div>
                  <p className="text-sm text-gray-500">
                    {application.repositoryName}
                  </p>

                  <h2 className="text-xl font-semibold">
                    {application.name}
                  </h2>

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                    <span>Project Type: {application.projectType}</span>
                    <span>Framework: {application.framework}</span>
                    <span>Host Port: {application.hostPort}</span>
                    <span>
                      Container Port: {application.containerPort}
                    </span>
                  </div>

                  <span
                    className={`inline-block mt-3 px-3 py-1 rounded-full text-sm ${
                      STATUS_PILL_CLASSES[application.status] ||
                      "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {application.status}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {canOpen ? (
                    <a
                      href={`http://localhost:${application.hostPort}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700"
                    >
                      Open
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="bg-gray-400 text-white px-5 py-2 rounded cursor-not-allowed"
                    >
                      Open
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => runAction(application, stopApplication)}
                    disabled={!isRunning || isBusy}
                    className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBusy ? "..." : "Stop"}
                  </button>

                  <button
                    type="button"
                    onClick={() => runAction(application, restartApplication)}
                    disabled={isBusy}
                    className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBusy
                      ? "..."
                      : application.status === "FAILED"
                      ? "Recover"
                      : "Restart"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
