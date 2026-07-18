import mongoose from "mongoose";

const repositorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    githubUrl: {
      type: String,
      required: true,
      trim: true,
    },

    cloneUrl: {
      type: String,
      required: true,
    },

    defaultBranch: {
      type: String,
      required: true,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "IMPORTED",
        "CLONING",
        "CLONED",
        "BUILDING",
        "BUILT",
        "RUNNING",
        "FAILED",
      ],
      default: "IMPORTED",
    },
    analysis: {
      framework: {
        type: String,
      },
      projectType:
      {
        type: String,
      },


      packageManager: {
        type: String,
      },
      commands: {
        devCommand: {
          type: String,
          default: null,
        },
        buildCommand: {
          type: String,
          default: null,
        },
        startCommand: {
          type: String,
          default: null,
        },
      },
    },

    localPath: {
      type: String,
      default: null,
    },
    docker:{
    imageId,
    imageTag,
    containerId,
    containerName,
    hostPort,
    containerPort,
}
  },
  
  {
    timestamps: true,
  }
);

const Repository = mongoose.model("Repository", repositorySchema);

export default Repository;