import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import DashboardLayout from "../layouts/DashboardLayout";
import { getRepositories } from "../api/repository.api";
import { getRepositoryDeployments } from "../api/deployment.api";

const statusColors = {
  RUNNING: "bg-yellow-100 text-yellow-700",
  SUCCESS: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  PARTIAL: "bg-orange-100 text-orange-700",
};

export default function Deployments() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDeployments = async () => {
      try {
        const repoData = await getRepositories();
        const repositories = repoData.repositories ?? [];

        // The API exposes deployments per repository, so gather them from
        // every repository the user owns and merge into one history list.
        const perRepository = await Promise.all(
          repositories.map(async (repository) => {
            try {
              const data = await getRepositoryDeployments(repository._id);

              return (data.deployments ?? []).map((deployment) => ({
                ...deployment,
                repositoryName: repository.name,
              }));
            } catch (error) {
              console.error(error);
              return [];
            }
          })
        );

        const merged = perRepository.flat().sort(
          (a, b) =>
            new Date(b.startedAt ?? b.createdAt ?? 0) -
            new Date(a.startedAt ?? a.createdAt ?? 0)
        );

        setDeployments(merged);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchDeployments();
  }, []);

  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">
        Deployments
      </h1>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : deployments.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          No deployments found.
        </div>
      ) : (
        <div className="space-y-4">
          {deployments.map((deployment) => (
            <div
              key={deployment._id}
              className="bg-white rounded-xl shadow p-6 flex items-center justify-between gap-4"
            >
              <div>
                <h2 className="text-lg font-semibold">
                  {deployment.repositoryName}
                </h2>

                <p className="text-sm text-gray-500">
                  {new Date(
                    deployment.startedAt ?? deployment.createdAt
                  ).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    statusColors[deployment.status] ||
                    "bg-gray-100 text-gray-700"
                  }`}
                >
                  {deployment.status}
                </span>

                <Link
                  to={`/deployments/${deployment._id}`}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
