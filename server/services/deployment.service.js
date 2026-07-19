import Deployment from "../models/deployment.model.js";
import AppError from "../utils/AppError.js";

export const findRepositoryDeployments = async (repositoryId) => {
  return await Deployment.find({
    repository: repositoryId,
  })
    .select("status startedAt completedAt createdAt")
    .sort({ startedAt: -1});
};

export const findDeploymentById = async (deploymentId) => {
  const deployment = await Deployment.findById(deploymentId);

  if (!deployment) {
    throw new AppError("Deployment not found", 404);
  }

  return deployment;
};