import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { importRepository, getRepositories ,cloneRepository,getRepositoryById,removeRepository, stopApplication, restartApplication, getRepositoryEnv, updateRepositoryEnv} from "../controllers/repository.controller.js";

const router = express.Router();

router.post("/", protect, importRepository);
router.get("/",protect,getRepositories)
router.post("/:id/clone", protect, cloneRepository);
router.get("/:id/env", protect, getRepositoryEnv);
router.put("/:id/env", protect, updateRepositoryEnv);
router.post("/:id/applications/:applicationName/stop", protect, stopApplication);
router.post("/:id/applications/:applicationName/restart", protect, restartApplication);
router.get("/:id", protect, getRepositoryById);
router.delete(
  "/:repositoryId",
  protect,
  removeRepository
);
export default router;