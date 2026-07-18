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

   const framework = detectFramework(packageJson);
   const containerPort = detectContainerPort(framework);

return {
  framework,
  projectType: detectProjectType(framework),
  packageManager: await detectPackageManager(repositoryPath),
  commands: detectCommands(packageJson),
  containerPort,
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

const detectPackageManager = async (repositoryPath) => {
  const packageManagers = [
    {
      file: "package-lock.json",
      manager: "npm",
    },
    {
      file: "yarn.lock",
      manager: "yarn",
    },
    {
      file: "pnpm-lock.yaml",
      manager: "pnpm",
    },
  ];

  for (const packageManager of packageManagers) {
    try {
      await fs.access(path.join(repositoryPath, packageManager.file));
      return packageManager.manager;
    } catch {
      continue;
    }
  }

  return "npm";
};
const detectPort = (framework) => {
  switch (framework) {
    case "Vite":
      return 5173;

    case "Next.js":
      return 3000;

    case "React":
      return 3000;

    case "Express":
      return 3000;

    default:
      return null;
  }
};

const detectProjectType = (framework) => {
  switch (framework) {
    case "React":
    case "Vite":
    case "Next.js":
      return "frontend";

    case "Express":
      return "backend";

    default:
      return "unknown";
  }
};