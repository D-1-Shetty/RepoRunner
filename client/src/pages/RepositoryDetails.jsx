import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import DashboardLayout from "../layouts/DashboardLayout";
import {
  getRepositoryById,
  stopApplication,
  restartApplication,
} from "../api/repository.api";
import { getRepositoryDeployments } from "../api/deployment.api";
import EnvironmentPanel from "../components/EnvironmentPanel/EnvironmentPanel";

// Deployment-level statuses (distinct from repository lifecycle statuses).
const deploymentStatusColors = {
  RUNNING: "bg-yellow-100 text-yellow-700",
  SUCCESS: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  PARTIAL: "bg-orange-100 text-orange-700",
};

export default function RepositoryDetails() {
  const { id } = useParams();

  const [repository, setRepository] = useState(null);

  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentsError, setDeploymentsError] = useState("");

  const [actionBusyKey, setActionBusyKey] = useState(null);
  const [actionError, setActionError] = useState("");

  const loadRepository = async () => {
    try {
      const data = await getRepositoryById(id);
      setRepository(data.repository);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadRepository();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const runApplicationAction = async (application, actionFn) => {
    try {
      setActionBusyKey(application.name);
      setActionError("");

      await actionFn(repository._id, application.name);

      // Refresh from the API so status / container info is real, not faked.
      await loadRepository();
    } catch (error) {
      console.error(error);
      setActionError(
        error?.response?.data?.message ||
          `Could not complete the action for "${application.name}".`
      );
    } finally {
      setActionBusyKey(null);
    }
  };

  const loadDeployments = async () => {
    setDeploymentsLoading(true);
    setDeploymentsError("");

    try {
      const data = await getRepositoryDeployments(id);
      setDeployments(data.deployments ?? []);
    } catch (error) {
      console.error(error);
      setDeploymentsError("Could not load deployment history.");
    } finally {
      setDeploymentsLoading(false);
    }
  };

  useEffect(() => {
    loadDeployments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Backend already sorts newest-first; sort defensively on the client too.
  const orderedDeployments = [...deployments].sort(
    (a, b) =>
      new Date(b.startedAt ?? b.createdAt ?? 0) -
      new Date(a.startedAt ?? a.createdAt ?? 0)
  );

  if (!repository) {
    return (
      <DashboardLayout>
        <p>Loading...</p>
      </DashboardLayout>
    );
  }

  const statusColors = {
    IMPORTED: "bg-gray-100 text-gray-700",
    CLONING: "bg-yellow-100 text-yellow-700",
    CLONED: "bg-blue-100 text-blue-700",
    BUILDING: "bg-orange-100 text-orange-700",
    RUNNING: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    PENDING: "bg-gray-100 text-gray-700",
    STOPPED: "bg-gray-200 text-gray-700",
  };

  const applications = Array.isArray(repository.applications)
    ? repository.applications
    : [];

  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">
        Repository Details
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-5">
            Repository
          </h2>

          <div className="space-y-4">

            <div>
              <p className="text-gray-500 text-sm">Name</p>
              <p className="font-semibold">{repository.name}</p>
            </div>

            <div>
              <p className="text-gray-500 text-sm">Status</p>

              <span
                className={`inline-block mt-1 px-3 py-1 rounded-full text-sm ${
                  statusColors[repository.status]
                }`}
              >
                {repository.status}
              </span>
            </div>

            <div>
              <p className="text-gray-500 text-sm">GitHub</p>

              <a
                href={repository.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {repository.githubUrl}
              </a>
            </div>

            <div>
              <p className="text-gray-500 text-sm">
                Default Branch
              </p>

              <p>{repository.defaultBranch}</p>
            </div>

          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-5">
            Project Analysis
          </h2>

          <div className="space-y-4">

            <div>
              <p className="text-gray-500 text-sm">
                Framework
              </p>
              <p>{repository.analysis?.framework}</p>
            </div>

            <div>
              <p className="text-gray-500 text-sm">
                Package Manager
              </p>
              <p>{repository.analysis?.packageManager}</p>
            </div>

            <div>
              <p className="text-gray-500 text-sm">
                Build Command
              </p>
              <p>{repository.analysis?.commands?.buildCommand}</p>
            </div>

            <div>
              <p className="text-gray-500 text-sm">
                Start Command
              </p>
              <p>{repository.analysis?.commands?.startCommand}</p>
            </div>

          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6 lg:col-span-2">
          <h2 className="text-xl font-bold mb-5">
            Applications
          </h2>

          {actionError && (
            <p className="mb-4 text-sm text-red-600">{actionError}</p>
          )}

          {applications.length > 0 ? (
            <div className="space-y-6">
              {applications.map((application, index) => {
                const hostPort = application.docker?.hostPort;
                const canOpen =
                  application.status === "RUNNING" && Boolean(hostPort);

                return (
                  <div
                    key={
                      application.docker?.containerId ||
                      application.name ||
                      index
                    }
                    className="border rounded-lg p-5"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">
                        {application.name}
                      </h3>

                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm ${
                          statusColors[application.status] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {application.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-gray-500 text-sm">
                          Project Type
                        </p>
                        <p>{application.projectType}</p>
                      </div>

                      <div>
                        <p className="text-gray-500 text-sm">
                          Framework
                        </p>
                        <p>{application.framework}</p>
                      </div>

                      <div>
                        <p className="text-gray-500 text-sm">
                          Container Name
                        </p>
                        <p className="break-all">
                          {application.docker?.containerName}
                        </p>
                      </div>

                      <div>
                        <p className="text-gray-500 text-sm">
                          Host Port
                        </p>
                        <p>{application.docker?.hostPort}</p>
                      </div>

                      <div>
                        <p className="text-gray-500 text-sm">
                          Container Port
                        </p>
                        <p>{application.docker?.containerPort}</p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-3">
                      {canOpen ? (
                        <a
                          href={`http://localhost:${hostPort}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block px-5 py-2 rounded text-white bg-green-600 hover:bg-green-700"
                        >
                          Open Application
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-block px-5 py-2 rounded text-white bg-gray-400 cursor-not-allowed"
                        >
                          Open Application
                        </button>
                      )}

                      {application.status === "RUNNING" && (
                        <button
                          type="button"
                          onClick={() =>
                            runApplicationAction(
                              application,
                              stopApplication
                            )
                          }
                          disabled={actionBusyKey === application.name}
                          className="inline-block px-5 py-2 rounded text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionBusyKey === application.name
                            ? "..."
                            : "Stop"}
                        </button>
                      )}

                      {application.status === "STOPPED" && (
                        <button
                          type="button"
                          onClick={() =>
                            runApplicationAction(
                              application,
                              restartApplication
                            )
                          }
                          disabled={actionBusyKey === application.name}
                          className="inline-block px-5 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionBusyKey === application.name
                            ? "..."
                            : "Restart"}
                        </button>
                      )}

                      {application.status === "FAILED" && (
                        <button
                          type="button"
                          onClick={() =>
                            runApplicationAction(
                              application,
                              restartApplication
                            )
                          }
                          disabled={actionBusyKey === application.name}
                          className="inline-block px-5 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionBusyKey === application.name
                            ? "..."
                            : "Recover"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : repository.docker ? (
            // Legacy fallback for repositories deployed before multi-application
            // support: show the single stored Docker record.
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-gray-500 text-sm">Image Tag</p>
                  <p>{repository.docker?.imageTag}</p>
                </div>

                <div>
                  <p className="text-gray-500 text-sm">
                    Container Name
                  </p>
                  <p>{repository.docker?.containerName}</p>
                </div>

                <div>
                  <p className="text-gray-500 text-sm">Container ID</p>
                  <p>{repository.docker?.containerId}</p>
                </div>

                <div>
                  <p className="text-gray-500 text-sm">Host Port</p>
                  <p>{repository.docker?.hostPort}</p>
                </div>

                <div>
                  <p className="text-gray-500 text-sm">
                    Container Port
                  </p>
                  <p>{repository.docker?.containerPort}</p>
                </div>
              </div>

              <div className="mt-5">
                <a
                  href={`http://localhost:${repository.docker?.hostPort}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-block px-5 py-2 rounded text-white ${
                    repository.status === "RUNNING" &&
                    repository.docker?.hostPort
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-gray-400 pointer-events-none"
                  }`}
                >
                  Open Application
                </a>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">
              No applications deployed yet.
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow p-6 lg:col-span-2">
          <h2 className="text-xl font-bold mb-5">
            Environment Variables
          </h2>

          <EnvironmentPanel repositoryId={repository._id} />
        </div>

        <div className="bg-white rounded-xl shadow p-6 lg:col-span-2">
          <h2 className="text-xl font-bold mb-5">
            Deployment History
          </h2>

          {deploymentsLoading ? (
            <p className="text-gray-500 text-sm">
              Loading deployment history…
            </p>
          ) : deploymentsError ? (
            <div className="text-sm">
              <p className="text-red-600">{deploymentsError}</p>
              <button
                type="button"
                onClick={loadDeployments}
                className="mt-2 text-blue-600 hover:text-blue-700"
              >
                Retry
              </button>
            </div>
          ) : orderedDeployments.length === 0 ? (
            <p className="text-gray-500 text-sm">No deployments yet.</p>
          ) : (
            <div className="space-y-3">
              {orderedDeployments.map((deployment) => (
                <div
                  key={deployment._id}
                  className="border rounded-lg p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm ${
                        deploymentStatusColors[deployment.status] ||
                        "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {deployment.status}
                    </span>

                    <p className="text-sm text-gray-500 mt-2">
                      Started:{" "}
                      {new Date(
                        deployment.startedAt ?? deployment.createdAt
                      ).toLocaleString()}
                    </p>

                    {deployment.completedAt && (
                      <p className="text-sm text-gray-500">
                        Completed:{" "}
                        {new Date(
                          deployment.completedAt
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <Link
                    to={`/deployments/${deployment._id}`}
                    className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-100 text-sm whitespace-nowrap"
                  >
                    View Details
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
