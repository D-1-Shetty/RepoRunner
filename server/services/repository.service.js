import fs from "fs/promises";

import Repository from "../models/repository.model.js";
import Deployment from "../models/deployment.model.js";

import { cleanupDeployment } from "./docker.service.js";

export const deleteRepository = async (repositoryId, userId) => {
  // Find repository owned by the logged-in user
  const repository = await Repository.findOne({
    _id: repositoryId,
    owner: userId,
  });

  if (!repository) {
    throw new Error("Repository not found");
  }

  // Cleanup Docker resources (container + image) for every application in
  // this repository (falls back to the legacy single `docker` field for
  // repositories that predate multi-application deployments).
  const dockerResources =
    Array.isArray(repository.applications) &&
    repository.applications.length > 0
      ? repository.applications.map((application) => application.docker)
      : repository.docker;

  try {
    await cleanupDeployment(dockerResources);
  } catch (error) {
    console.warn("Docker cleanup failed:", error.message);
  }

  // Delete cloned repository folder
  if (repository.localPath) {
    try {
      await fs.rm(repository.localPath, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      console.warn("Directory cleanup failed:", error.message);
    }
  }

  // Delete all deployment records
  await Deployment.deleteMany({
    repository: repository._id,
  });

  // Delete repository document
  await repository.deleteOne();

  return repository;
};