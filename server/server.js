import express from "express";
import cors from "cors";
import morgan from "morgan";

import connectDB from "./database/db.js";
import { PORT } from "./config/env.js";

import authRoutes from "./routes/auth.routes.js";
const app = express();

// Database
connectDB();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api/auth", authRoutes);
// Health Check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "RepoRunner Backend Running 🚀",
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});