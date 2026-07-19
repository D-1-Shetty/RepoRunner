
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import net from "net";
const execAsync = promisify(exec);
export const generateDockerfile = (analysis) => {
  switch (analysis.framework) {
    case "Vite":
    case "React":
      return `FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm","run","dev","--","--host"]`;

    case "Express":
      return `FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm","start"]`;

    default:
      throw new Error("Unsupported framework");
  }
};

export const writeDockerfile = async (
  repositoryPath,
  dockerfileContent
) => {
  const dockerfilePath = path.join(repositoryPath, "Dockerfile");

  await fs.writeFile(dockerfilePath, dockerfileContent);

  return dockerfilePath;
};

export const buildDockerImage = async (repositoryPath, imageTag) => {
  const buildCommand = `docker build -t ${imageTag} ${repositoryPath}`;

  await execAsync(buildCommand);

  const { stdout } = await execAsync(
    `docker image inspect ${imageTag} --format "{{.Id}}"`
  );

  return {
    imageId: stdout.trim(),
    imageTag,
  };
};

export const runContainer = async (
  imageTag,
  containerName,
  hostPort,
  containerPort
) => {
  const command = `docker run -d -p ${hostPort}:${containerPort} --name ${containerName} ${imageTag}`;

  const { stdout } = await execAsync(command);

  return {
    containerId: stdout.trim(),
    containerName,
    hostPort,
    containerPort,
  };
};

export const getAvailablePort = (startPort = 40000) => {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.listen(startPort, () => {
      const { port } = server.address();

      server.close(() => resolve(port));
    });

    server.on("error", () => {
      resolve(getAvailablePort(startPort + 1));
    });
  });
};

export const stopContainer = async (containerId) => {
  const command = `docker stop ${containerId}`;

  await execAsync(command);

  return true;
};

export const removeContainer = async (containerId) => {
  const command = `docker rm ${containerId}`;

  await execAsync(command);

  return true;
};

export const removeImage = async (imageTag) => {
  const command = `docker rmi ${imageTag}`;

  await execAsync(command);

  return true;
};

export const cleanupDeployment = async (docker) => {
  if (!docker) return;

  try {
    if (docker.containerId) {
      await stopContainer(docker.containerId);
      await removeContainer(docker.containerId);
    }
  } catch (error) {
    console.warn("Container cleanup skipped:", error.message);
  }

  try {
    if (docker.imageTag) {
      await removeImage(docker.imageTag);
    }
  } catch (error) {
    console.warn("Image cleanup skipped:", error.message);
  }
};