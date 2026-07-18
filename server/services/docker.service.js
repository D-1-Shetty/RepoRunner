
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

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

};