
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import net from "net";
const execAsync = promisify(exec);
export const generateDockerfile = (analysis) => {
  const {
    commands,
    containerPort,
    projectType,
    workingDirectory,
  } = analysis;

  const dockerfile = [];

  dockerfile.push("FROM node:22-alpine");
  dockerfile.push("");
  dockerfile.push("WORKDIR /app");
  dockerfile.push("");

  if (workingDirectory) {
    dockerfile.push(
      `COPY ${workingDirectory}/package*.json ./`
    );
  } else {
    dockerfile.push("COPY package*.json ./");
  }

  dockerfile.push("");

  if (commands.installCommand) {
    dockerfile.push(`RUN ${commands.installCommand}`);
    dockerfile.push("");
  }

  if (workingDirectory) {
    dockerfile.push(`COPY ${workingDirectory}/ .`);
  } else {
    dockerfile.push("COPY . .");
  }

  dockerfile.push("");

  if (
    projectType === "frontend" &&
    commands.buildCommand
  ) {
    dockerfile.push(`RUN ${commands.buildCommand}`);
    dockerfile.push("");
  }

  dockerfile.push(`EXPOSE ${containerPort}`);
  dockerfile.push("");

  const cmd = commands.startCommand
    .split(" ")
    .map((arg) => `"${arg}"`)
    .join(",");

  dockerfile.push(`CMD [${cmd}]`);

  return dockerfile.join("\n");
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

// Writes the given environment variables to a private, single-use file for
// `docker run --env-file`. Secret values therefore never appear on the
// command line (no shell history / `ps` exposure) and never go through a
// shell, so no escaping/injection concerns. The caller deletes the file
// once the container has been created.
const writeEnvFile = async (env) => {
  const entries = Object.entries(env ?? {}).filter(
    ([key, value]) =>
      key && value !== undefined && value !== null
  );

  if (entries.length === 0) return null;

  const filePath = path.join(
    os.tmpdir(),
    `reporunner-env-${crypto.randomBytes(8).toString("hex")}.env`
  );

  const contents = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  await fs.writeFile(filePath, contents, { mode: 0o600 });

  return filePath;
};

export const runContainer = async (
  imageTag,
  containerName,
  hostPort,
  containerPort,
  env = {}
) => {
  const envFilePath = await writeEnvFile(env);

  try {
    const args = [
      "run",
      "-d",
      "-p",
      `${hostPort}:${containerPort}`,
      "--name",
      containerName,
      // Lets a deployed container reach services on the RepoRunner host
      // (e.g. a local MongoDB) via `host.docker.internal`. `host-gateway`
      // resolves to the host on Linux, matching Docker Desktop behaviour.
      "--add-host=host.docker.internal:host-gateway",
    ];

    if (envFilePath) {
      args.push("--env-file", envFilePath);
    }

    args.push(imageTag);

    const { stdout } = await execAsync(`docker ${args.join(" ")}`);

    return {
      containerId: stdout.trim(),
      containerName,
      hostPort,
      containerPort,
    };
  } finally {
    if (envFilePath) {
      await fs.rm(envFilePath, { force: true });
    }
  }
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

// Restarts an existing container in place - same container, image, port
// mapping and env. Works whether the container is currently running or
// stopped. Does not touch the image.
export const restartContainer = async (containerId) => {
  const command = `docker restart ${containerId}`;

  await execAsync(command);

  return true;
};

export const removeContainer = async (containerId) => {
  const command = `docker rm ${containerId}`;

  await execAsync(command);

  return true;
};

// Read-only: returns { [containerName]: state } for every RepoRunner-managed
// container, running or not. `state` is Docker's container state string
// ("running", "restarting", "exited", "created", "paused", "dead", ...).
// Never starts, stops, builds or removes anything.
export const listContainerStates = async () => {
  const { stdout } = await execAsync(
    `docker ps -a --filter "name=reporunner-" --format "{{.Names}}|{{.State}}"`
  );

  const states = {};

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf("|");
    if (separatorIndex === -1) continue;

    const name = trimmed.slice(0, separatorIndex);
    const state = trimmed.slice(separatorIndex + 1);

    if (name) states[name] = state;
  }

  return states;
};

export const removeImage = async (imageTag) => {
  const command = `docker rmi ${imageTag}`;

  await execAsync(command);

  return true;
};

// Read-only: true if the given image tag/ID still exists locally.
export const imageExists = async (imageRef) => {
  try {
    await execAsync(`docker image inspect ${imageRef}`);
    return true;
  } catch {
    return false;
  }
};

// Accepts either a single docker resource ({ containerId, imageTag }) or an
// array of them, so it can clean up one application or every application of
// a multi-application deployment.
export const cleanupDeployment = async (dockerResources) => {
  if (!dockerResources) return;

  const resources = Array.isArray(dockerResources)
    ? dockerResources
    : [dockerResources];

  for (const docker of resources) {
    if (!docker) continue;

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
  }
};