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

// Fixed set of locations we look for an application's package.json in.
// Order also controls the order applications are returned in.
const APPLICATION_LOCATIONS = [
  "package.json",
  "client/package.json",
  "frontend/package.json",
  "backend/package.json",
  "server/package.json",
  "admin/package.json",
];

const findApplicationPackageJsons = async (repositoryPath) => {
  const found = [];

  for (const location of APPLICATION_LOCATIONS) {
    const packageJsonPath = path.join(repositoryPath, location);

    try {
      await fs.access(packageJsonPath);

      const relativeDirectory = path.dirname(location);

      found.push({
        packageJsonPath,
        projectRoot: path.dirname(packageJsonPath),
        workingDirectory:
          relativeDirectory === "." ? "" : relativeDirectory,
      });
    } catch {
      continue;
    }
  }

  return found;
};

const buildApplication = async ({
  packageJsonPath,
  projectRoot,
  workingDirectory,
}) => {
  const packageJson = JSON.parse(
    await fs.readFile(packageJsonPath, "utf-8")
  );

  const framework = detectFramework(packageJson);

  const name =
    (workingDirectory ? path.basename(projectRoot) : packageJson.name) ||
    packageJson.name ||
    "app";

  return {
    name,
    framework,
    projectType: detectProjectType(framework),
    workingDirectory,
    packageManager: await detectPackageManager(projectRoot),
    commands: detectCommands(packageJson),
    containerPort: detectContainerPort(framework),
  };
};

export const analyzeProject = async (repositoryPath) => {
  try {
    const packageJsonLocations = await findApplicationPackageJsons(
      repositoryPath
    );

    if (packageJsonLocations.length === 0) {
      throw new Error("package.json not found");
    }

    const applications = [];

    for (const location of packageJsonLocations) {
      try {
        applications.push(await buildApplication(location));
      } catch (error) {
        console.warn(
          `Skipping unreadable package.json at ${location.packageJsonPath}:`,
          error.message
        );
      }
    }

    if (applications.length === 0) {
      throw new Error("No analyzable applications found");
    }

    return { applications };
  } catch (error) {
    console.error("Analysis Error:", error);
    return null;
  }
};

const detectCommands = (packageJson) => {
  const scripts = packageJson.scripts ?? {};

  if (scripts.preview) {
    return {
      installCommand: "npm install",
      buildCommand: scripts.build ? "npm run build" : null,
      startCommand: "npm run preview -- --host 0.0.0.0",
    };
  }

  if (scripts.start) {
    return {
      installCommand: "npm install",
      buildCommand: scripts.build ? "npm run build" : null,
      startCommand: "npm start",
    };
  }

  if (scripts.dev) {
    return {
      installCommand: "npm install",
      buildCommand: scripts.build ? "npm run build" : null,
      startCommand: "npm run dev",
    };
  }

  return {
    installCommand: "npm install",
    buildCommand: null,
    startCommand: null,
  };
};

const detectPackageManager = async (projectRoot) => {
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
      await fs.access(
        path.join(projectRoot, packageManager.file)
      );

      return packageManager.manager;
    } catch {
      continue;
    }
  }

  return "npm";
};

const detectContainerPort = (framework) => {
  switch (framework) {
    case "Vite":
      return 4173;

    case "Next.js":
      return 3000;

    case "React":
      return 3000;

    case "Express":
      return 3000;

    default:
      return 3000;
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
