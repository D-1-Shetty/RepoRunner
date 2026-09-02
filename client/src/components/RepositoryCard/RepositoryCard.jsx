import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { deployRepository } from "../../api/repository.api";
import DeployModal from "../DeployModal/DeployModal";

export default function RepositoryCard({
  repository,
  onDelete,
}) {
  const navigate = useNavigate();
  const [deploying, setDeploying] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);

  const statusColors = {
    IMPORTED: "bg-gray-100 text-gray-700",
    CLONING: "bg-yellow-100 text-yellow-700",
    CLONED: "bg-blue-100 text-blue-700",
    BUILDING: "bg-orange-100 text-orange-700",
    BUILT: "bg-indigo-100 text-indigo-700",
    RUNNING: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
  };

  const appStatusColors = {
    RUNNING: "bg-green-100 text-green-700",
    STOPPED: "bg-gray-200 text-gray-700",
    FAILED: "bg-red-100 text-red-700",
    PENDING: "bg-gray-100 text-gray-600",
  };

  const applications = Array.isArray(repository.applications)
    ? repository.applications
    : [];

  const goToDetails = () =>
    navigate(`/repositories/${repository._id}`);

  const handleCardKeyDown = (event) => {
    // Only act when the card itself has focus - not a button/link inside it.
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goToDetails();
    }
  };

  const handleDeploy = async (env) => {
    try {
      setDeploying(true);

      const hasEnv = env && Object.keys(env).length > 0;

      const data = await deployRepository(
        repository._id,
        hasEnv ? { env } : undefined
      );

      setShowDeployModal(false);
      navigate(`/deployments/${data.deployment.id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${repository.name} details`}
        onClick={goToDetails}
        onKeyDown={handleCardKeyDown}
        className="bg-white rounded-xl shadow-md p-6 flex justify-between items-center cursor-pointer hover:shadow-lg transition"
      >
        <div>
          <h2 className="text-xl font-semibold">
            {repository.name}
          </h2>

          <p className="text-gray-500 mt-1">
            {repository.githubUrl}
          </p>

          <span
            className={`inline-block mt-3 px-3 py-1 rounded-full text-sm ${
              statusColors[repository.status] ||
              "bg-gray-100 text-gray-700"
            }`}
          >
            {repository.status}
          </span>

          <div className="mt-3">
            {applications.length === 0 ? (
              <p className="text-sm text-gray-400">
                No applications yet
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  {applications.length}{" "}
                  {applications.length === 1
                    ? "application"
                    : "applications"}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {applications.map((application, index) => (
                    <span
                      key={
                        application._id ??
                        `${application.name}-${index}`
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        appStatusColors[application.status] ||
                        "bg-gray-100 text-gray-700"
                      }`}
                    >
                      <span className="font-medium">
                        {application.name}
                      </span>
                      <span>{application.status}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowDeployModal(true);
            }}
            disabled={deploying}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deploying ? "Deploying..." : "Deploy"}
          </button>

          <Link
            to={`/repositories/${repository._id}`}
            onClick={(event) => event.stopPropagation()}
            className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-100"
          >
            View
          </Link>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(repository._id);
            }}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      <DeployModal
        isOpen={showDeployModal}
        repositoryName={repository.name}
        loading={deploying}
        onClose={() => setShowDeployModal(false)}
        onDeploy={handleDeploy}
      />
    </>
  );
}
