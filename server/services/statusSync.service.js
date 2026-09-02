import Repository from "../models/repository.model.js";
import { listContainerStates } from "./docker.service.js";

// Docker container state -> RepoRunner application status.
//   running / restarting        -> RUNNING
//   created / paused / exited /
//   dead / removing / ...        -> STOPPED
//   (container not found)        -> FAILED   (handled by the caller)
const mapContainerStateToStatus = (state) => {
  if (state === "running" || state === "restarting") return "RUNNING";
  return "STOPPED";
};

// Aggregates per-application statuses into the repository-level status.
//   any RUNNING          -> RUNNING
//   else any FAILED      -> FAILED
//   else all STOPPED     -> STOPPED
//   else (PENDING/empty) -> null  (leave repository.status unchanged)
const aggregateRepositoryStatus = (applicationStatuses) => {
  if (applicationStatuses.length === 0) return null;
  if (applicationStatuses.includes("RUNNING")) return "RUNNING";
  if (applicationStatuses.includes("FAILED")) return "FAILED";
  if (applicationStatuses.every((status) => status === "STOPPED")) {
    return "STOPPED";
  }
  return null;
};

// Repository top-level statuses during which a container may legitimately not
// exist yet - skip these repos so an in-progress deployment is never flagged.
const DEPLOYING_STATUSES = new Set(["CLONING", "BUILDING"]);

let syncInProgress = false;

// One reconciliation pass: compare the real Docker container state of every
// deployed application against the stored status and fix any drift.
// Read-only against Docker; the only writes are targeted `status` updates.
export const syncApplicationStatuses = async () => {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    let containerStates;

    try {
      containerStates = await listContainerStates();
    } catch (error) {
      console.warn(
        "Status sync skipped - could not query Docker:",
        error.message
      );
      return;
    }

    const repositories = await Repository.find({
      "applications.0": { $exists: true },
    }).select("name status applications");

    for (const repository of repositories) {
      if (DEPLOYING_STATUSES.has(repository.status)) continue;

      // Status each application will have after this pass - used only to keep
      // repository.status consistent, below.
      const resolvedStatuses = [];

      for (const application of repository.applications) {
        const containerName = application.docker?.containerName;

        // Not deployed yet (e.g. PENDING with no container) - nothing to do.
        if (!containerName || !application.docker?.containerId) {
          resolvedStatuses.push(application.status);
          continue;
        }

        const state = containerStates[containerName];

        const desiredStatus =
          state === undefined
            ? "FAILED" // container no longer exists
            : mapContainerStateToStatus(state);

        resolvedStatuses.push(desiredStatus);

        if (application.status === desiredStatus) continue;

        // Targeted update of just this application's status so a concurrent
        // deploy/stop/restart writing the same document is not clobbered.
        await Repository.updateOne(
          { _id: repository._id },
          { $set: { "applications.$[app].status": desiredStatus } },
          { arrayFilters: [{ "app.docker.containerName": containerName }] }
        );

        console.log(
          `Status sync: ${repository.name || repository._id} / ${application.name}: ${application.status} -> ${desiredStatus}`
        );
      }

      // Reconcile the repository-level status with its applications.
      const nextRepositoryStatus =
        aggregateRepositoryStatus(resolvedStatuses);

      if (
        nextRepositoryStatus &&
        nextRepositoryStatus !== repository.status
      ) {
        await Repository.updateOne(
          { _id: repository._id },
          { $set: { status: nextRepositoryStatus } }
        );

        console.log(
          `Status sync: ${repository.name || repository._id}: ${repository.status} -> ${nextRepositoryStatus}`
        );
      }
    }
  } catch (error) {
    console.error("Status sync failed:", error.message);
  } finally {
    syncInProgress = false;
  }
};

// Starts the periodic reconciliation loop. Interval is configurable via
// STATUS_SYNC_INTERVAL_MS (default 30s); set it to 0 to disable.
export const startStatusSync = () => {
  const intervalMs = Number(
    process.env.STATUS_SYNC_INTERVAL_MS ?? 30000
  );

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    console.log(
      "Status sync disabled (STATUS_SYNC_INTERVAL_MS <= 0)."
    );
    return null;
  }

  // First pass shortly after startup, then on the interval.
  setTimeout(syncApplicationStatuses, 5000);

  const timer = setInterval(syncApplicationStatuses, intervalMs);

  // Do not keep the process alive solely for this timer.
  if (typeof timer.unref === "function") timer.unref();

  console.log(`Status sync running every ${intervalMs}ms.`);

  return timer;
};
