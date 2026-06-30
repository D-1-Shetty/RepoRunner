import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { importRepository, getRepositories } from "../controllers/repository.controller.js";

const router = express.Router();

router.post("/", protect, importRepository);
router.get("/",protect,getRepositories)

export default router;