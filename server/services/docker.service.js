
import fs from "fs/promises";
import path from "path";
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

CMD ["npm","run","dev"]`;

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