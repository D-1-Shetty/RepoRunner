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

  socket.on("join-deployment", (deploymentId) => {
    socket.join(`deployment-${deploymentId}`);

    console.log(
      `${socket.id} joined deployment-${deploymentId}`
    );
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


app.use(cors());
app.use(express.json());
app.use(morgan("dev"));


app.use("/api/auth", authRoutes);
app.use("/api/repositories", repositoryRoutes);
app.use("/api/deployments", deploymentRoutes);


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