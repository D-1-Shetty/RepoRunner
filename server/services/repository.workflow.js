import {
  cloneRepository as cloneRepositoryService,
} from "./github.service.js";

import { analyzeProject } from "./analysis.service.js";

import {
  generateDockerfile,
  writeDockerfile,
  buildDockerImage,
  runContainer,
  getAvailablePort,
  cleanupDeployment,
} from "./docker.service.js";

import Deployment from "../models/deployment.model.js";
import { getSocketIO } from "./socket.service.js";
export const cloneRepositoryWorkflow = async (repository) => {
  let deployment;
  try {
    deployment = await Deployment.create({
  repository: repository._id,
});

await addDeploymentLog(
  deployment,
  "Deployment started."
);
    await cleanupDeployment(repository.docker);
    await cleanupRepository(
    repository.localPath
);
await addDeploymentLog(
  deployment,
  "Previous deployment cleaned."
);
    // Step 1: Update repository status
    repository.status = "CLONING";
    await repository.save();

    // Step 2: Clone repository
    await cloneRepositoryService(
      repository.cloneUrl,
      repository.localPath
    );
     await addDeploymentLog(
  deployment,
  "Repository cloned successfully."
);

    // Step 3: Analyze project
    const analysis = await analyzeProject(repository.localPath);

    if (!analysis) {
      throw new Error("Project analysis failed");
    }
    await addDeploymentLog(
  deployment,
  `Framework detected: ${analysis.framework}`
);
   

    repository.analysis = analysis;
    repository.status = "CLONED";

    await repository.save();

    // Step 4: Generate Dockerfile
    const dockerfile = generateDockerfile(analysis);

    await writeDockerfile(
      repository.localPath,
      dockerfile
    );

    // Step 5: Build Docker image
    repository.status = "BUILDING";
    await repository.save();

    const dockerInfo = await buildDockerImage(
      repository.localPath,
      `reporunner-${repository._id}`
    );
    await addDeploymentLog(
  deployment,
  "Docker image built successfully."
);

    // Step 6: Run Docker container
    const hostPort = await getAvailablePort();

    const containerInfo = await runContainer(
      dockerInfo.imageTag,
      `reporunner-${repository._id}`,
      hostPort,
      analysis.containerPort
    );
    await addDeploymentLog(
  deployment,
  "Container started successfully."
);

    // Step 7: Save Docker metadata
    repository.docker = {
      ...dockerInfo,
      ...containerInfo,
    };

    repository.status = "RUNNING";

    await repository.save();
    deployment.status = "SUCCESS";
deployment.completedAt = new Date();
await addDeploymentLog(
  deployment,
  "Deployment completed successfully."
);



    return repository;

  } catch (error) {
    repository.status = "FAILED";

    await repository.save();
    if (deployment) {
    deployment.status = "FAILED";
    deployment.completedAt = new Date();

    await addDeploymentLog(
        deployment,
        error.message
    );

    await deployment.save();
}



await deployment.save();

    throw error;
  }
};

import fs from "fs/promises";

const cleanupRepository = async (repositoryPath) => {
  try {
    await fs.rm(repositoryPath, {
      recursive: true,
      force: true,
    });
  } catch (error) {
    console.warn(
      "Repository cleanup skipped:",
      error.message
    );
  }
};



const addDeploymentLog = async (
  deployment,
  message
) => {
  const log = {
    message,
    createdAt: new Date(),
  };

  deployment.logs.push(log);

  await deployment.save();

  const io = getSocketIO();

  io.to(`deployment-${deployment._id}`).emit(
  "deployment-log",
  {
    deploymentId: deployment._id,
    ...log,
  }
);
};