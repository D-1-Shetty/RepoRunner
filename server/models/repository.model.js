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
        "STOPPED",
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
      containerPort: {
        type: Number,
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
    docker: {
      imageId: String,
      imageTag: String,
      containerId: String,
      containerName: String,
      hostPort: Number,
      containerPort: Number,
    },

    // One entry per application detected by analyzeProject(), each with its
    // own Docker image/container. Populated for both single- and
    // multi-application repositories.
    applications: [
      {
        name: String,
        framework: String,
        projectType: String,
        workingDirectory: String,
        packageManager: String,
        containerPort: Number,
        commands: {
          installCommand: {
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
        docker: {
          imageId: String,
          imageTag: String,
          containerId: String,
          containerName: String,
          hostPort: Number,
          containerPort: Number,
        },
        status: {
          type: String,
          enum: ["PENDING", "RUNNING", "FAILED", "STOPPED"],
          default: "PENDING",
        },
      },
    ],

    // Persistent per-repository deployment configuration. `env[].value` holds
    // ONLY an encrypted payload (see server/utils/secretbox.js) - never a
    // plaintext value.
    deploymentConfig: {
      env: [
        {
          key: String,
          value: String,
          secret: Boolean,
          updatedAt: Date,
        },
      ],
      updatedAt: Date,
    },

  },

  {
    timestamps: true,
  }
);

const Repository = mongoose.model("Repository", repositorySchema);

export default Repository;