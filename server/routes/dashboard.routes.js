import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { dashboardStats } from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get("/stats", protect, dashboardStats);

export default router;