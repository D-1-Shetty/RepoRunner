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
    "RUNNING",
    "FAILED",
  ],
  default: "IMPORTED",
},
  },
  
  {
    timestamps: true,
  }
);

const Repository = mongoose.model("Repository", repositorySchema);

export default Repository;