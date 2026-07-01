import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { importRepository, getRepositories ,cloneRepository } from "../controllers/repository.controller.js";

const router = express.Router();

router.post("/", protect, importRepository);
router.get("/",protect,getRepositories)
router.post("/:id/clone", protect, cloneRepository);

export default router;