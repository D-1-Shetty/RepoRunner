import express from "express";
import { getRepositoryDeployments,getDeployment } from "../controllers/deployment.controller.js";

const router = express.Router();


router.get("/repository/:repositoryId", getRepositoryDeployments);
router.get("/:deploymentId", getDeployment);
export default router;