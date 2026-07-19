import mongoose from "mongoose";

const deploymentSchema = new mongoose.Schema(
  {
    repository: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Repository",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "RUNNING",
        "SUCCESS",
        "FAILED",
      ],
      default: "RUNNING",
    },

    logs: [
      {
        message: {
          type: String,
          required: true,
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    startedAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Deployment = mongoose.model(
  "Deployment",
  deploymentSchema
);

export default Deployment;