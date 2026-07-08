import fs from "fs/promises";
import path from "path";

const detectFramework = (packageJson) => {
 const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};

  if (dependencies.next) return "Next.js";
  if (dependencies.vite) return "Vite";
  if (dependencies.react) return "React";
  if (dependencies.express) return "Express";

  return "Node.js";
};

export const analyzeProject = async (repositoryPath) => {
  const packageJsonPath = path.join(repositoryPath, "package.json");

  try {
    const packageJson = JSON.parse(
      await fs.readFile(packageJsonPath, "utf-8")
    );

    return {
      packageJson,
      framework: detectFramework(packageJson),
      commands: detectCommands(packageJson),
    };
  } catch {
    return null;
  }
};

const detectCommands = (packageJson) => {
  const scripts = packageJson.scripts ?? {};

  return {
    devCommand: scripts.dev ? "npm run dev" : null,
    buildCommand: scripts.build ? "npm run build" : null,
    startCommand: scripts.start
      ? "npm start"
      : scripts.preview
      ? "npm run preview"
      : null,
  };
};