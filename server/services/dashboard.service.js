import Repository from "../models/repository.model.js";
import Deployment from "../models/deployment.model.js";

export const getDashboardStats = async (userId) => {
  const repositories = await Repository.find({
    owner: userId,
  }).select("_id status");

  const repositoryIds = repositories.map((repo) => repo._id);

  const repositoryCount = repositories.length;

  const runningApps = repositories.filter(
    (repo) => repo.status === "RUNNING"
  ).length;

  const deploymentCount = await Deployment.countDocuments({
    repository: { $in: repositoryIds },
  });

  const successfulDeployments = await Deployment.countDocuments({
    repository: { $in: repositoryIds },
    status: "SUCCESS",
  });

  const successRate =
    deploymentCount === 0
      ? 0
      : Math.round(
          (successfulDeployments / deploymentCount) * 100
        );

  return {
    repositories: repositoryCount,
    deployments: deploymentCount,
    runningApps,
    successRate,
  };
};