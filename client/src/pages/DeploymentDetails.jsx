import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import socket from "../services/socket";
import DashboardLayout from "../layouts/DashboardLayout";

import { getDeployment } from "../api/deployment.api";

// Persisted / emitted log entries carry a MongoDB _id; fall back to a
// composite key for any entry that somehow lacks one.
const logKey = (log) =>
  log && log._id
    ? String(log._id)
    : `${log?.createdAt ?? ""}::${log?.message ?? ""}`;

// Merge two log arrays, drop duplicates by key, order by createdAt.
const mergeLogs = (a = [], b = []) => {
  const byKey = new Map();
  for (const log of [...a, ...b]) byKey.set(logKey(log), log);

  return [...byKey.values()].sort(
    (x, y) => new Date(x.createdAt) - new Date(y.createdAt)
  );
};

// A terminal status must never be regressed back to RUNNING by a slower
// snapshot arriving afterwards.
const pickStatus = (current, incoming) =>
  current && current !== "RUNNING" ? current : incoming;

export default function DeploymentDetails() {
  const { id } = useParams();

  const [deployment, setDeployment] = useState(null);

  // Initial HTTP snapshot - still the primary loader (also brings the
  // repository/applications data the socket events do not include).
  useEffect(() => {
    const fetchDeployment = async () => {
      try {
        const data = await getDeployment(id);

        setDeployment((prev) =>
          prev
            ? {
                ...data.deployment,
                status: pickStatus(prev.status, data.deployment.status),
                completedAt:
                  prev.completedAt ?? data.deployment.completedAt,
                logs: mergeLogs(prev.logs, data.deployment.logs),
              }
            : data.deployment
        );
      } catch (error) {
        console.error(error);
      }
    };

    fetchDeployment();
  }, [id]);

  // Room join + live listeners + reconnect handling.
  useEffect(() => {
    const joinRoom = () => socket.emit("join-deployment", id);

    const matchesThisDeployment = (payload) =>
      String(payload?.deploymentId) === String(id);

    const handleHistory = (payload) => {
      if (!matchesThisDeployment(payload)) return;

      setDeployment((prev) => ({
        ...(prev ?? {}),
        status: pickStatus(prev?.status, payload.status),
        completedAt: prev?.completedAt ?? payload.completedAt ?? null,
        logs: mergeLogs(prev?.logs, payload.logs),
      }));
    };

    const handleLog = (log) => {
      if (!matchesThisDeployment(log)) return;

      setDeployment((prev) => ({
        ...(prev ?? {}),
        logs: mergeLogs(prev?.logs, [log]),
      }));
    };

    const handleStatus = (payload) => {
      if (!matchesThisDeployment(payload)) return;

      setDeployment((prev) => ({
        ...(prev ?? {}),
        status: payload.status,
        completedAt: payload.completedAt ?? prev?.completedAt ?? null,
      }));
    };

    socket.on("connect", joinRoom);
    socket.on("deployment-history", handleHistory);
    socket.on("deployment-log", handleLog);
    socket.on("deployment-status", handleStatus);

    // Join immediately (the shared socket is usually already connected);
    // the "connect" handler covers a later (re)connect.
    joinRoom();

    return () => {
      socket.emit("leave-deployment", id);
      socket.off("connect", joinRoom);
      socket.off("deployment-history", handleHistory);
      socket.off("deployment-log", handleLog);
      socket.off("deployment-status", handleStatus);
    };
  }, [id]);

  if (!deployment) {
    return (
      <DashboardLayout>
        Loading...
      </DashboardLayout>
    );
  }

  const applications = deployment.repository?.applications ?? [];

  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">
        Deployment
      </h1>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold">
          Status :
          <span className="ml-2 text-blue-600">
            {deployment.status}
          </span>
        </h2>

        {deployment.status === "RUNNING" && (
          <p className="mt-2 text-sm text-gray-500">
            Deployment in progress…
          </p>
        )}
      </div>

      {/* Applications */}
      <div className="mt-8 bg-white rounded-xl shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">
            Applications
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {applications.length === 0 ? (
            <p className="text-gray-500">
              No applications found.
            </p>
          ) : (
            applications.map((application, index) => {
              const hostPort = application.docker?.hostPort;

              const url = hostPort
                ? `http://localhost:${hostPort}`
                : null;

              return (
                <div
                  key={index}
                  className="border rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      {application.name}
                    </h3>

                    <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm">
                      {application.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                    <div>
                      <p className="text-gray-500">Project Type</p>
                      <p className="font-medium">
                        {application.projectType}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500">Framework</p>
                      <p className="font-medium">
                        {application.framework}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500">Host Port</p>
                      <p className="font-medium">
                        {application.docker?.hostPort}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500">Container Port</p>
                      <p className="font-medium">
                        {application.docker?.containerPort}
                      </p>
                    </div>
                  </div>

                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-4 text-blue-600 hover:underline break-all"
                    >
                      {url}
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Deployment Logs */}
      <div className="mt-8 bg-white rounded-xl shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">
            Deployment Logs
          </h2>
        </div>

        <div className="p-6 space-y-3">
          {deployment.logs?.map((log, index) => (
            <div
              key={index}
              className="border-l-4 border-blue-500 pl-4"
            >
              <p className="font-medium">
                {log.message}
              </p>

              <p className="text-sm text-gray-500">
                {new Date(log.createdAt).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
