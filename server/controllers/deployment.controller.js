import asyncHandler from "../utils/asyncHandler.js";

import {
  findRepositoryDeployments,
  findDeploymentById,
} from "../services/deployment.service.js";

export const getRepositoryDeployments = asyncHandler(async (req, res) => {
  const deployments = await findRepositoryDeployments(
    req.params.repositoryId
  );

  res.status(200).json({
    success: true,
    deployments,
  });
});

export const getDeployment = asyncHandler(async (req, res) => {
  const deployment = await findDeploymentById(
    req.params.deploymentId
  );

  res.status(200).json({
    success: true,
    deployment,
  });
});