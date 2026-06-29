import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { importRepository } from "../controllers/repository.controller.js";

const router = express.Router();

router.post("/", protect, importRepository);

export default router;