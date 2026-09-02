import express from "express";
import cors from "cors";
import morgan from "morgan";
import http from "http";
import { Server } from "socket.io";

import connectDB from "./database/db.js";
import { PORT } from "./config/env.js";

import authRoutes from "./routes/auth.routes.js";
import repositoryRoutes from "./routes/repository.routes.js";
import deploymentRoutes from "./routes/deployment.routes.js";

import errorHandler from "./middleware/error.middleware.js";
import { setSocketIO } from "./services/socket.service.js";
import { startStatusSync } from "./services/statusSync.service.js";
import Deployment from "./models/deployment.model.js";

import dashboardRoutes from "./routes/dashboard.routes.js";
const app = express();


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
setSocketIO(io);
io.on("connection", (socket) => {
  console.log(`Client Connected: ${socket.id}`);

  socket.on("join-deployment", async (deploymentId) => {
    socket.join(`deployment-${deploymentId}`);

    console.log(
      `${socket.id} joined deployment-${deploymentId}`
    );

    // Send the just-joined socket the existing logs + current status so a
    // late join or a reconnect is not missing anything. Requesting socket
    // only - not the whole room.
    try {
      const deployment = await Deployment.findById(deploymentId).select(
        "logs status completedAt"
      );

      if (!deployment) return;

      socket.emit("deployment-history", {
        deploymentId: deployment._id,
        logs: deployment.logs,
        status: deployment.status,
        completedAt: deployment.completedAt,
      });
    } catch (error) {
      console.warn(
        `Could not send deployment history for ${deploymentId}:`,
        error.message
      );
    }
  });

  socket.on("leave-deployment", (deploymentId) => {
    socket.leave(`deployment-${deploymentId}`);

    console.log(
      `${socket.id} left deployment-${deploymentId}`
    );
  });

  socket.on("disconnect", () => {
    console.log(`Client Disconnected: ${socket.id}`);
  });
});


connectDB();

// Periodically reconcile repository.applications[].status with the real
// Docker container state (crash/stop detection).
startStatusSync();


app.use(cors());
app.use(express.json());
app.use(morgan("dev"));


app.use("/api/auth", authRoutes);
app.use("/api/repositories", repositoryRoutes);
app.use("/api/deployments", deploymentRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "RepoRunner Backend Running ",
  });
});


app.use(errorHandler);


server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});