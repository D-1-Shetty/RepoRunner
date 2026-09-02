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
  const deployment = await Deployment.findById(deploymentId).populate({
    path: "repository",
    // Explicit allow-list: only the fields the frontend needs to show each
    // deployed application. No environment variables / secrets are stored
    // on the repository, and nothing else is exposed here.
    select: [
      "name",
      "applications.name",
      "applications.framework",
      "applications.projectType",
      "applications.workingDirectory",
      "applications.containerPort",
      "applications.status",
      "applications.docker.imageId",
      "applications.docker.imageTag",
      "applications.docker.containerId",
      "applications.docker.containerName",
      "applications.docker.hostPort",
      "applications.docker.containerPort",
    ].join(" "),
  });

  if (!deployment) {
    throw new AppError("Deployment not found", 404);
  }

  return deployment;
};