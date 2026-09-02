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
import { decrypt } from "../utils/secretbox.js";
import { waitForApplicationHttp } from "./healthCheck.service.js";
import path from "path";

const DEFAULT_START_PORT = 40000;

// The frontend's VITE_* values are embedded into JavaScript that runs in
// the user's browser (not inside the frontend container), so the backend
// must be addressed at its browser-accessible published URL.
const BROWSER_ACCESSIBLE_HOST = "localhost";

// Build-time VITE_* variables a frontend may use to locate the backend.
const FRONTEND_BACKEND_ENV_VARS = [
  "VITE_API_BASE_URL",
  "VITE_SOCKET_URL",
];

// Vite reads these files at build time; a value in any of them counts as
// "explicitly provided" by the imported application and is never replaced.
const VITE_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

// Docker requires image/container names to be lowercase and limited to
// [a-z0-9._-], so an application name coming from a folder name is sanitized.
const sanitizeDockerName = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-");

const capitalize = (value) =>
  value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;

// Same string used as both the image tag and the container name, one per
// application. An optional per-deployment suffix keeps a new deployment's
// resources from colliding with the still-running previous deployment's.
const resourceName = (repository, application, suffix = "") =>
  `reporunner-${repository._id}-${sanitizeDockerName(application.name)}${
    suffix ? `-${sanitizeDockerName(suffix)}` : ""
  }`;

// Only variables explicitly provided in this deployment's own configuration
// object are ever forwarded to a deployed container. RepoRunner's own
// process.env / .env file is never read or forwarded here.
const sanitizeEnvConfig = (env) => {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(env)) {
    // Valid POSIX-ish environment variable name only.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (value === undefined || value === null) continue;

    sanitized[key] = String(value);
  }

  return sanitized;
};

// Resolves the flat { KEY: plaintext } environment for a deployment.
// Precedence: a non-empty request env (POST /clone body) is a one-time
// override and wins outright - the saved deploymentConfig is not consulted
// and is never modified. Otherwise the repository's saved deploymentConfig.env
// (encrypted at rest) is decrypted here, in memory only, and never written
// back. Throws with a value-free message if a saved value cannot be
// decrypted so the caller can fail the whole deployment.
const resolveDeploymentEnv = (repository, deploymentConfig) => {
  const requestEnv = sanitizeEnvConfig(deploymentConfig?.env);

  if (Object.keys(requestEnv).length > 0) {
    return requestEnv;
  }

  const decrypted = {};

  for (const entry of repository.deploymentConfig?.env ?? []) {
    if (!entry?.key || !entry.value) continue; // no key / no stored value

    try {
      decrypted[entry.key] = decrypt(entry.value);
    } catch {
      throw new Error(
        `Saved environment value for "${entry.key}" could not be decrypted. Check CONFIG_ENCRYPTION_KEY or re-save the environment configuration.`
      );
    }
  }

  // Same normalisation the request-env path gets (string coercion, key check).
  return sanitizeEnvConfig(decrypted);
};

// Environment variables handed to a single application's container. Only
// backend applications receive the configured env; PORT defaults to the
// analyzed container port but the configuration may override it.
const buildContainerEnv = (application, backendEnv) => {
  if (application.projectType !== "backend") return {};

  return {
    PORT: String(application.containerPort),
    ...backendEnv,
  };
};

// The port the container actually listens on. If the configuration set a
// valid PORT, that wins; otherwise the analyzed container port is used.
const resolveContainerPort = (application, containerEnv) => {
  const configuredPort = Number(containerEnv.PORT);

  if (Number.isInteger(configuredPort) && configuredPort > 0) {
    return configuredPort;
  }

  return application.containerPort;
};

// Docker resources currently attached to a repository, in whatever shape
// cleanupDeployment() understands (a single docker object, an array of
// them, or nothing).
const collectDockerResources = (repository) => {
  if (
    Array.isArray(repository.applications) &&
    repository.applications.length > 0
  ) {
    return repository.applications.map(
      (application) => application.docker
    );
  }

  return repository.docker;
};

// True when the given resources reference at least one real container/image
// (i.e. there is a previous deployment worth protecting / cleaning up).
const hasDockerResources = (resources) => {
  if (!resources) return false;

  const list = Array.isArray(resources) ? resources : [resources];
  return list.some(
    (docker) => docker && (docker.containerId || docker.imageTag)
  );
};

// Recursively collects candidate source files under an application
// directory (skipping dependency/build-output folders).
const collectSourceFiles = async (dir, acc = [], depth = 0) => {
  if (depth > 6) return acc;

  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "build"
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectSourceFiles(fullPath, acc, depth + 1);
    } else if (/\.(mjs|cjs|jsx?|tsx?|vue|svelte|html)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }

  return acc;
};

// Which of FRONTEND_BACKEND_ENV_VARS are actually referenced in the
// frontend's source ("if the frontend uses these variables").
const detectUsedFrontendEnvVars = async (appDir) => {
  const files = await collectSourceFiles(appDir);
  const used = new Set();

  for (const file of files) {
    let content;

    try {
      content = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }

    for (const key of FRONTEND_BACKEND_ENV_VARS) {
      if (content.includes(key)) used.add(key);
    }

    if (used.size === FRONTEND_BACKEND_ENV_VARS.length) break;
  }

  return used;
};

// Env var names the imported application already defines in its own Vite
// env files - these must not be overwritten.
const readAppEnvFileKeys = async (appDir) => {
  const keys = new Set();

  for (const fileName of VITE_ENV_FILES) {
    let content;

    try {
      content = await fs.readFile(path.join(appDir, fileName), "utf-8");
    } catch {
      continue;
    }

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq === -1) continue;

      keys.add(line.slice(0, eq).trim());
    }
  }

  return keys;
};

// Appends the given vars to <appDir>/.env.production.local - the
// highest-priority Vite env file, and .gitignore'd by convention so it is
// never part of the cloned source. Only ever called with keys that are not
// already defined anywhere.
const writeFrontendBuildEnvFile = async (appDir, vars) => {
  const filePath = path.join(appDir, ".env.production.local");

  let prefix = "";

  try {
    const existing = await fs.readFile(filePath, "utf-8");
    prefix =
      existing.length && !existing.endsWith("\n")
        ? `${existing}\n`
        : existing;
  } catch {
    prefix = "";
  }

  const body =
    Object.entries(vars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n";

  await fs.writeFile(filePath, prefix + body);

  return filePath;
};

// Bakes the already-deployed backend's URL into a frontend's build, but
// only for VITE_* variables the frontend references and that neither the
// imported app nor the deploy request already provides.
const configureFrontendBackendUrl = async ({
  application,
  localPath,
  backendHostPort,
  userEnv,
  deployment,
}) => {
  const appDir = path.join(
    localPath,
    application.workingDirectory || ""
  );

  const usedVars = await detectUsedFrontendEnvVars(appDir);
  if (usedVars.size === 0) return null;

  const appDefinedKeys = await readAppEnvFileKeys(appDir);
  const backendUrl = `http://${BROWSER_ACCESSIBLE_HOST}:${backendHostPort}`;

  const injected = {};

  // Auto-provide the backend URL for referenced vars that are not already
  // set by the app or explicitly by the user.
  for (const key of usedVars) {
    if (appDefinedKeys.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(userEnv, key)) continue;

    injected[key] = backendUrl;
  }

  // Carry user-provided VITE_* values into the frontend build as-is
  // (unless the app itself already defines them).
  for (const [key, value] of Object.entries(userEnv)) {
    if (!key.startsWith("VITE_")) continue;
    if (appDefinedKeys.has(key)) continue;

    injected[key] = value;
  }

  if (Object.keys(injected).length === 0) return null;

  const filePath = await writeFrontendBuildEnvFile(appDir, injected);

  // Log variable names and the (non-secret) host port only - never values.
  await addDeploymentLog(
    deployment,
    `Configured ${application.name} to reach the backend on host port ${backendHostPort} (${Object.keys(injected).join(", ")}).`
  );

  return filePath;
};

export const cloneRepositoryWorkflow = async (
  repository,
  deployment,
  deploymentConfig = {}
) => {
  // Rollback state - captured before any change, also read from the catch.
  let previousDockerResources;
  let previousLocalPath = repository.localPath;
  let hadPreviousDeployment = false;
  let buildPath = repository.localPath;

  try {
    // Capture the currently-deployed resources first. They are NOT stopped,
    // removed or overwritten until the new deployment is fully built,
    // started and health-checked.
    previousDockerResources = collectDockerResources(repository);
    previousLocalPath = repository.localPath;
    hadPreviousDeployment = hasDockerResources(previousDockerResources);

    // The new deployment builds into its own clone directory and suffixes
    // its Docker resource names with the deployment id, so it can be built
    // and run alongside the still-running previous deployment.
    const deploymentTag = deployment._id.toString();
    buildPath = `${previousLocalPath}-${deploymentTag}`;

    await addDeploymentLog(
      deployment,
      "Deployment started."
    );

    // Request env (one-time override) wins; otherwise decrypt the saved
    // repository.deploymentConfig.env. A decryption failure throws here and
    // is handled by the deployment-failure path below (no partial env).
    const backendEnv = resolveDeploymentEnv(repository, deploymentConfig);

    await addDeploymentLog(
      deployment,
      hadPreviousDeployment
        ? "Building the new deployment (current deployment kept running)..."
        : "Preparing deployment..."
    );

    // Step 1
    repository.status = "CLONING";
    await repository.save();

    // Step 2 - clone into the NEW build directory; the previous clone is kept.
    await cloneRepositoryService(
      repository.cloneUrl,
      buildPath
    );

    await addDeploymentLog(
      deployment,
      "Repository cloned successfully."
    );

    // Step 3
    const analysis = await analyzeProject(
      buildPath
    );

    if (
      !analysis ||
      !Array.isArray(analysis.applications) ||
      analysis.applications.length === 0
    ) {
      throw new Error(
        "Project analysis failed: no deployable application (package.json) was found in this repository."
      );
    }

    const { applications } = analysis;

    await addDeploymentLog(
      deployment,
      `${applications.length} ${
        applications.length === 1 ? "application" : "applications"
      } detected.`
    );

    for (const detectedApplication of applications) {
      await addDeploymentLog(
        deployment,
        `Application detected: ${detectedApplication.name} - ${detectedApplication.framework}`
      );
    }

    repository.status = "CLONED";
    await repository.save();

    // Step 4: build and run every detected application. Each one gets its
    // own Dockerfile, image, container and host port - none of them are
    // hardcoded, this loop treats "client"/"backend"/anything else the same.
    repository.status = "BUILDING";
    await repository.save();

    const deployedApplications = [];
    const builtResources = [];
    let nextPort = DEFAULT_START_PORT;

    // Deploy backend applications first so their assigned host port is known
    // before any frontend image is built (Vite bakes VITE_* in at build time).
    const orderedApplications = [
      ...applications.filter(
        (application) => application.projectType === "backend"
      ),
      ...applications.filter(
        (application) => application.projectType !== "backend"
      ),
    ];

    let primaryBackendHostPort = null;
    let frontendBuildEnvFile = null;

    try {
      for (const application of orderedApplications) {
        await addDeploymentLog(
          deployment,
          `Building ${application.name}...`
        );

        // Resolve this application's runtime configuration. Only backend
        // applications get the configured env; the container port is kept
        // in sync with a configured PORT so the host mapping still works.
        const containerEnv = buildContainerEnv(application, backendEnv);
        const effectiveContainerPort = resolveContainerPort(
          application,
          containerEnv
        );

        if (containerEnv.PORT !== undefined) {
          containerEnv.PORT = String(effectiveContainerPort);
        }

        const configuredEnvCount = Object.keys(containerEnv).length;

        if (configuredEnvCount > 0) {
          // Count only - never the names or values of secret variables.
          await addDeploymentLog(
            deployment,
            `Passing ${configuredEnvCount} environment variable(s) to ${application.name}.`
          );
        }

        // Frontend applications are configured with the already-deployed
        // backend's browser-accessible URL before their image is built.
        if (
          application.projectType !== "backend" &&
          primaryBackendHostPort !== null
        ) {
          frontendBuildEnvFile = await configureFrontendBackendUrl({
            application,
            localPath: buildPath,
            backendHostPort: primaryBackendHostPort,
            userEnv: backendEnv,
            deployment,
          });
        }

        const dockerfile = generateDockerfile({
          ...application,
          containerPort: effectiveContainerPort,
        });

        await writeDockerfile(
          buildPath,
          dockerfile
        );

        const imageTag = resourceName(
          repository,
          application,
          deploymentTag
        );

        const dockerInfo = await buildDockerImage(
          buildPath,
          imageTag
        );

        // The generated build-time env file has been baked into the image;
        // remove it so RepoRunner leaves no deployment configuration inside
        // the cloned repository.
        if (frontendBuildEnvFile) {
          await fs.rm(frontendBuildEnvFile, { force: true });
          frontendBuildEnvFile = null;
        }

        // Recorded as soon as it exists so a failure later this iteration
        // (or in a later application) still cleans this image up.
        const resource = { imageTag: dockerInfo.imageTag };
        builtResources.push(resource);

        await addDeploymentLog(
          deployment,
          `${capitalize(application.name)} Docker image built.`
        );

        // Host port is always chosen by RepoRunner, never by the caller.
        const hostPort = await getAvailablePort(nextPort);
        nextPort = hostPort + 1;

        const containerName = resourceName(
          repository,
          application,
          deploymentTag
        );

        const containerInfo = await runContainer(
          dockerInfo.imageTag,
          containerName,
          hostPort,
          effectiveContainerPort,
          containerEnv
        );

        resource.containerId = containerInfo.containerId;

        await addDeploymentLog(
          deployment,
          `${capitalize(application.name)} container started on port ${hostPort}.`
        );

        // Verify the application actually answers over HTTP - a running
        // container is not the same as a working app. Any HTTP response
        // (even 404/5xx) passes; only "nothing is listening" fails. A
        // failure throws, which triggers the same cleanup/rollback as a
        // build failure below.
        await addDeploymentLog(
          deployment,
          `Checking ${application.name} is responding over HTTP...`
        );

        const health = await waitForApplicationHttp(hostPort);

        if (!health.healthy) {
          throw new Error(
            `${capitalize(application.name)} container is running but did not respond over HTTP on port ${hostPort} after ${health.attempts} attempts`
          );
        }

        await addDeploymentLog(
          deployment,
          `${capitalize(application.name)} is responding over HTTP (status ${health.status}).`
        );

        // Remember the first backend's host port for later frontend builds.
        if (
          application.projectType === "backend" &&
          primaryBackendHostPort === null
        ) {
          primaryBackendHostPort = hostPort;
        }

        deployedApplications.push({
          name: application.name,
          framework: application.framework,
          projectType: application.projectType,
          workingDirectory: application.workingDirectory,
          packageManager: application.packageManager,
          containerPort: effectiveContainerPort,
          commands: application.commands,
          docker: { ...dockerInfo, ...containerInfo },
          status: "RUNNING",
        });
      }
    } catch (error) {
      await addDeploymentLog(
        deployment,
        `Deployment failed: ${error.message}. Cleaning up created resources...`
      );

      // Remove a build-time env file that was written but whose image never
      // finished building, so it is not left inside the clone.
      if (frontendBuildEnvFile) {
        await fs.rm(frontendBuildEnvFile, { force: true });
      }

      // Tear down whatever was already built/started this run so nothing
      // is left orphaned.
      await cleanupDeployment(builtResources);

      throw error;
    }

    // Every new application is built, started and health-checked. Only now
    // is it safe to remove the previous deployment.
    if (hadPreviousDeployment) {
      await addDeploymentLog(
        deployment,
        "New deployment is healthy. Removing the previous deployment..."
      );

      await cleanupDeployment(previousDockerResources);
    }

    if (previousLocalPath && previousLocalPath !== buildPath) {
      await cleanupRepository(previousLocalPath);
    }

    // Step 5 - persist the NEW deployment.
    repository.applications = deployedApplications;
    repository.localPath = buildPath;

    // When there is exactly one application, also keep the legacy
    // single-application fields populated so the existing single-app views
    // keep working unchanged; otherwise clear them (matches prior behaviour).
    if (deployedApplications.length === 1) {
      const [onlyApplication] = deployedApplications;

      repository.analysis = {
        framework: onlyApplication.framework,
        projectType: onlyApplication.projectType,
        containerPort: onlyApplication.containerPort,
        packageManager: onlyApplication.packageManager,
        commands: onlyApplication.commands,
      };

      repository.docker = onlyApplication.docker;
    } else {
      repository.analysis = undefined;
      repository.docker = undefined;
    }

    repository.status = "RUNNING";

    await repository.save();

    deployment.status = "SUCCESS";
    deployment.completedAt = new Date();

    await addDeploymentLog(
      deployment,
      "Deployment completed successfully."
    );

    await deployment.save();

    emitDeploymentStatus(deployment);

  } catch (error) {

    // The new deployment failed. Its own partial resources were already torn
    // down by the build-loop catch above (or nothing was created yet); the
    // previous deployment's containers/images were never touched. Remove only
    // the new (failed) clone directory - never the previous one.
    if (buildPath && buildPath !== previousLocalPath) {
      await cleanupRepository(buildPath);
    }

    if (hadPreviousDeployment) {
      // repository.applications / localPath / docker were never overwritten,
      // so they still point at the previous, still-running deployment.
      repository.status = "RUNNING";
      await repository.save();

      deployment.status = "FAILED";
      deployment.completedAt = new Date();

      await addDeploymentLog(
        deployment,
        "Deployment failed; previous deployment left running."
      );
    } else {
      // No previous deployment to fall back to - preserve existing behaviour.
      repository.status = "FAILED";
      await repository.save();

      deployment.status = "FAILED";
      deployment.completedAt = new Date();

      await addDeploymentLog(
        deployment,
        error.message
      );
    }

    await deployment.save();

    emitDeploymentStatus(deployment);

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
  deployment.logs.push({
    message,
    createdAt: new Date(),
  });

  // Preserve existing behaviour: persist the log BEFORE emitting it.
  await deployment.save();

  // The pushed subdocument now has a MongoDB _id (default on array
  // subdocuments - no schema change). Emit it so the frontend can
  // deduplicate history vs live events.
  const savedLog = deployment.logs[deployment.logs.length - 1];

  const io = getSocketIO();

  io.to(`deployment-${deployment._id}`).emit("deployment-log", {
    deploymentId: deployment._id,
    _id: savedLog._id,
    message: savedLog.message,
    createdAt: savedLog.createdAt,
  });
};

// Notifies the deployment room of a terminal status change (SUCCESS / FAILED).
// Best-effort: an emit failure never affects persistence or the workflow's
// own error handling. Carries no environment values.
const emitDeploymentStatus = (deployment) => {
  try {
    getSocketIO()
      .to(`deployment-${deployment._id}`)
      .emit("deployment-status", {
        deploymentId: deployment._id,
        status: deployment.status,
        completedAt: deployment.completedAt,
      });
  } catch (error) {
    console.warn(
      "Could not emit deployment-status:",
      error.message
    );
  }
};