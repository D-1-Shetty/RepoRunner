import Repository from "../models/repository.model.js";
import validateGithubUrl from "../utils/validateGithubUrl.js";
import extractGithubInfo from "../utils/extractGithubInfo.js";
import { cloneRepositoryWorkflow } from "../services/repository.workflow.js";
import {getRepository} from "../services/github.service.js";
import Deployment from "../models/deployment.model.js";
import { deleteRepository } from "../services/repository.service.js";
import {
  stopContainer,
  restartContainer,
  runContainer,
  getAvailablePort,
  removeContainer,
  imageExists,
} from "../services/docker.service.js";
import { encrypt, decrypt } from "../utils/secretbox.js";


import path from "path";
import { REPOSITORY_STORAGE_PATH } from "../config/path.js";

// Valid POSIX-ish environment variable name.
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Validates the optional `env` map sent with a deploy request. Returns an
// error message, or null when the payload is acceptable (absent included).
// Never logs or echoes the values.
const validateEnvPayload = (env) => {
  if (env === undefined || env === null) return null;

  if (typeof env !== "object" || Array.isArray(env)) {
    return "env must be an object of KEY: value pairs";
  }

  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_PATTERN.test(key)) {
      return `Invalid environment variable name: "${key}"`;
    }

    if (typeof value !== "string" && typeof value !== "number") {
      return `Invalid value for "${key}" (must be a string)`;
    }
  }

  return null;
};

// Decrypts the repository's saved deploymentConfig.env into a flat
// { KEY: plaintext } object. Entries with no stored value are skipped.
// Throws a value-free error if any stored value cannot be decrypted - the
// caller must abort rather than start a container without it. Never logs values.
const decryptSavedEnv = (repository) => {
  const decrypted = {};

  for (const entry of repository.deploymentConfig?.env ?? []) {
    if (!entry?.key || !entry.value) continue;

    try {
      decrypted[entry.key] = decrypt(entry.value);
    } catch {
      throw new Error(
        `Saved environment value for "${entry.key}" could not be decrypted`
      );
    }
  }

  return decrypted;
};

export const importRepository = async (req, res) => {
  try {
    const { name, githubUrl } = req.body;

    if (!name || !githubUrl) {
      return res.status(400).json({
        success: false,
        message: "Repository name and GitHub URL are required",
      });
    }

    if (!validateGithubUrl(githubUrl)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GitHub repository URL",
      });
    }

    const { owner, repo } = extractGithubInfo(githubUrl);

    const repositoryData = await getRepository(owner, repo);

    if (!repositoryData) {
      return res.status(404).json({
        success: false,
        message: "Repository not found on GitHub",
      });
    }

    const repository = await Repository.create({
      name: repositoryData.name,
      githubUrl,
      cloneUrl: repositoryData.clone_url,
      defaultBranch: repositoryData.default_branch,
      owner: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Repository imported successfully",
      repository,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getRepositories = async (req, res) => {
  try {
    const repositories = await Repository.find({
      owner: req.user._id,
    }).select(
      "name githubUrl createdAt status docker applications"
    );

    return res.status(200).json({
      success: true,
      count: repositories.length,
      repositories,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getRepositoryById = async (req, res) => {
  try {
    const repository = await Repository.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    res.status(200).json({
      success: true,
      repository,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const cloneRepository = async (req, res) => {
  try {
    const { id } = req.params;

    // Optional per-deployment configuration supplied by the caller.
    // Currently only `env` (a map of environment variables for backend
    // containers) is used.
    const { env } = req.body ?? {};

    const envError = validateEnvPayload(env);

    if (envError) {
      return res.status(400).json({
        success: false,
        message: envError,
      });
    }

    // Ownership check: only the authenticated owner of this repository may
    // deploy it (and therefore supply its environment variables).
    const repository = await Repository.findOne({
      _id: id,
      owner: req.user._id,
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    repository.localPath = path.join(
      REPOSITORY_STORAGE_PATH,
      repository._id.toString()
    );

    const deployment = await Deployment.create({
    repository: repository._id,
});

res.status(202).json({
    success: true,
    deployment: {
        id: deployment._id,
        status: deployment.status,
    },
});

cloneRepositoryWorkflow(
    repository,
    deployment,
    { env }
).catch(console.error);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// Loads a repository owned by the authenticated user and one of its
// applications, identified by application name. Returns { error } with an
// HTTP status when either lookup fails.
const findOwnedApplication = async (
  repositoryId,
  ownerId,
  applicationName
) => {
  const repository = await Repository.findOne({
    _id: repositoryId,
    owner: ownerId,
  });

  if (!repository) {
    return { error: { status: 404, message: "Repository not found" } };
  }

  const application = (repository.applications ?? []).find(
    (app) => app.name === applicationName
  );

  if (!application) {
    return { error: { status: 404, message: "Application not found" } };
  }

  return { repository, application };
};

export const stopApplication = async (req, res) => {
  try {
    const { id, applicationName } = req.params;

    const { repository, application, error } = await findOwnedApplication(
      id,
      req.user._id,
      applicationName
    );

    if (error) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }

    if (!application.docker?.containerId) {
      return res.status(409).json({
        success: false,
        message: "Application has no container to stop",
      });
    }

    // Stops only this application's container. The image and every other
    // application in the repository are untouched.
    await stopContainer(application.docker.containerId);

    application.status = "STOPPED";
    await repository.save();

    return res.status(200).json({
      success: true,
      message: `Application "${application.name}" stopped`,
      application: {
        name: application.name,
        status: application.status,
      },
    });
  } catch (error) {
    console.error(
      `[stopApplication] failed for repository ${req.params.id} / application ${req.params.applicationName}:`,
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to stop application",
    });
  }
};

export const restartApplication = async (req, res) => {
  try {
    const { id, applicationName } = req.params;

    const { repository, application, error } = await findOwnedApplication(
      id,
      req.user._id,
      applicationName
    );

    if (error) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }

    // FAILED means the container no longer exists, so an in-place restart is
    // impossible. Recreate it from the stored deployment info instead.
    if (application.status === "FAILED") {
      const imageTag = application.docker?.imageTag;
      const containerName = application.docker?.containerName;

      if (!imageTag || !containerName) {
        return res.status(409).json({
          success: false,
          message:
            "Application has no stored deployment information to recover from",
        });
      }

      // Reuse the existing image - never rebuild the repository here.
      if (!(await imageExists(imageTag))) {
        return res.status(409).json({
          success: false,
          message:
            "Application image no longer exists. Redeploy the repository to rebuild it.",
        });
      }

      // Load + decrypt the repository's saved environment configuration
      // BEFORE touching any Docker resource, so a decryption failure aborts
      // recovery without a partially-configured container. `{}` when there is
      // no saved configuration -> recovery proceeds exactly as before.
      let recoveryEnv;
      try {
        recoveryEnv = decryptSavedEnv(repository);
      } catch (error) {
        console.error(
          `[restartApplication] recovery aborted for repository ${req.params.id} / application ${req.params.applicationName}: ${error.message}`
        );

        return res.status(500).json({
          success: false,
          message:
            "Saved environment configuration could not be decrypted; application was not recovered",
        });
      }

      // Best effort: clear any dead container still holding the name.
      try {
        await removeContainer(containerName);
      } catch {
        // No leftover container - expected for a FAILED application.
      }

      const containerPort =
        application.docker?.containerPort ?? application.containerPort;

      // Prefer the stored host port; getAvailablePort() falls back to the
      // next free port if it is now taken by something else.
      const hostPort = await getAvailablePort(application.docker?.hostPort);

      // Recreate from the stored image, injecting the decrypted saved
      // environment configuration (empty object => no --env-file, same as
      // the previous behaviour).
      const containerInfo = await runContainer(
        imageTag,
        containerName,
        hostPort,
        containerPort,
        recoveryEnv
      );

      application.docker.containerId = containerInfo.containerId;
      application.docker.hostPort = containerInfo.hostPort;
      application.docker.containerPort = containerInfo.containerPort;
      application.status = "RUNNING";

      await repository.save();

      return res.status(200).json({
        success: true,
        message: `Application "${application.name}" recovered`,
        application: {
          name: application.name,
          status: application.status,
        },
      });
    }

    if (!application.docker?.containerId) {
      return res.status(409).json({
        success: false,
        message: "Application has no container to restart",
      });
    }

    // RUNNING / STOPPED: restart the existing container in place - no
    // rebuild, no new image, no effect on other applications.
    await restartContainer(application.docker.containerId);

    application.status = "RUNNING";
    await repository.save();

    return res.status(200).json({
      success: true,
      message: `Application "${application.name}" restarted`,
      application: {
        name: application.name,
        status: application.status,
      },
    });
  } catch (error) {
    console.error(
      `[restartApplication] failed for repository ${req.params.id} / application ${req.params.applicationName}:`,
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to restart application",
    });
  }
};

// Shape of an env entry returned to clients: keys/metadata only, never the
// value (plaintext or ciphertext).
const toEnvSummary = (entry) => ({
  key: entry.key,
  secret: entry.secret ?? true,
  hasValue: Boolean(entry.value),
});

export const getRepositoryEnv = async (req, res) => {
  try {
    const repository = await Repository.findOne({
      _id: req.params.id,
      owner: req.user._id,
    }).select("deploymentConfig");

    if (!repository) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    return res.status(200).json({
      success: true,
      env: (repository.deploymentConfig?.env ?? []).map(toEnvSummary),
      updatedAt: repository.deploymentConfig?.updatedAt ?? null,
    });
  } catch (error) {
    console.error(
      `[getRepositoryEnv] failed for repository ${req.params.id}:`,
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load environment configuration",
    });
  }
};

export const updateRepositoryEnv = async (req, res) => {
  try {
    const { env } = req.body ?? {};

    // --- validate payload shape (no DB access, no values logged) ---
    if (!Array.isArray(env)) {
      return res.status(400).json({
        success: false,
        message: "env must be an array of { key, value } entries",
      });
    }

    // --- ownership (same pattern as clone / stop / restart); loaded early so
    //     `keep` can resolve against the currently stored entries ---
    const repository = await Repository.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    const currentByKey = new Map(
      (repository.deploymentConfig?.env ?? []).map((entry) => [
        entry.key,
        entry,
      ])
    );

    // --- pass 1: validate + plan every entry. No encryption, no writes.
    //     `keep` is request-only and is never stored. ---
    const seenKeys = new Set();
    const plan = [];

    for (const entry of env) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return res.status(400).json({
          success: false,
          message: "Each env entry must be an object",
        });
      }

      const { key, value, secret, keep } = entry;

      if (typeof key !== "string" || !ENV_KEY_PATTERN.test(key)) {
        return res.status(400).json({
          success: false,
          message: `Invalid environment variable name: "${key}"`,
        });
      }

      if (seenKeys.has(key)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate environment variable name: "${key}"`,
        });
      }
      seenKeys.add(key);

      const existing = currentByKey.get(key);

      const resolvedSecret =
        secret === undefined
          ? existing?.secret ?? true
          : Boolean(secret);

      if (keep === true) {
        if (!existing) {
          return res.status(400).json({
            success: false,
            message: `Cannot keep unknown environment variable: "${key}"`,
          });
        }

        plan.push({ kind: "keep", key, secret: resolvedSecret, existing });
        continue;
      }

      if (value === undefined) {
        return res.status(400).json({
          success: false,
          message: `Provide a value or set keep:true for "${key}"`,
        });
      }

      if (typeof value !== "string") {
        return res.status(400).json({
          success: false,
          message: `Value for "${key}" must be a string`,
        });
      }

      if (value === "") {
        if (!existing) {
          return res.status(400).json({
            success: false,
            message: `New environment variable "${key}" needs a value`,
          });
        }

        plan.push({ kind: "clear", key, secret: resolvedSecret });
        continue;
      }

      plan.push({ kind: "set", key, value, secret: resolvedSecret });
    }

    // --- pass 2: build the COMPLETE final array in memory before any write.
    //     `keep` copies the stored ciphertext verbatim (no decrypt / no
    //     re-encrypt); only new/replaced values are encrypted. If any
    //     encryption fails, nothing is written. ---
    const now = new Date();
    let finalEntries;

    try {
      finalEntries = plan.map((item) => {
        if (item.kind === "keep") {
          return {
            key: item.key,
            value: item.existing.value,
            secret: item.secret,
            updatedAt: item.existing.updatedAt ?? now,
          };
        }

        if (item.kind === "clear") {
          return {
            key: item.key,
            value: "",
            secret: item.secret,
            updatedAt: now,
          };
        }

        return {
          key: item.key,
          value: encrypt(item.value),
          secret: item.secret,
          updatedAt: now,
        };
      });
    } catch (error) {
      console.error(
        `[updateRepositoryEnv] encryption failed for repository ${req.params.id}:`,
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Environment configuration could not be encrypted and was not saved",
      });
    }

    // --- atomic whole-array replacement: one assignment, one save. Any
    //     previously stored key not present above is removed. ---
    repository.deploymentConfig = {
      env: finalEntries,
      updatedAt: now,
    };

    await repository.save();

    return res.status(200).json({
      success: true,
      message: "Environment configuration updated",
      env: finalEntries.map(toEnvSummary),
      updatedAt: now,
    });
  } catch (error) {
    console.error(
      `[updateRepositoryEnv] failed for repository ${req.params.id}:`,
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update environment configuration",
    });
  }
};

export const stopRepository = async (req,res)=>{

    await stopContainer(
        repository.docker.containerId
    );

}

export const removeRepository = async (req, res, next) => {
  try {
    await deleteRepository(
      req.params.repositoryId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      message: "Repository deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};