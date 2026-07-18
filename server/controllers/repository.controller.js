import Repository from "../models/repository.model.js";
import validateGithubUrl from "../utils/validateGithubUrl.js";
import extractGithubInfo from "../utils/extractGithubInfo.js";

import {
  getRepository,
  cloneRepository as cloneRepositoryService,
} from "../services/github.service.js";

import { analyzeProject } from "../services/analysis.service.js";

import {
  generateDockerfile,
  writeDockerfile,
  buildDockerImage,
} from "../services/docker.service.js";

import path from "path";
import { REPOSITORY_STORAGE_PATH } from "../config/path.js";

export const importRepository = async (req, res) => {
  try {
    const { name, githubUrl } = req.body;

    if (!name || !githubUrl) {
      return res.status(400).json({
        success: false,
        message: "Repository name and GitHub URL are required",
      });
    }

    if (!validateGithubUrl(githubUrl)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GitHub repository URL",
      });
    }

    const { owner, repo } = extractGithubInfo(githubUrl);

    const repositoryData = await getRepository(owner, repo);

    if (!repositoryData) {
      return res.status(404).json({
        success: false,
        message: "Repository not found on GitHub",
      });
    }

    const repository = await Repository.create({
      name: repositoryData.name,
      githubUrl,
      cloneUrl: repositoryData.clone_url,
      defaultBranch: repositoryData.default_branch,
      owner: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Repository imported successfully",
      repository,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getRepositories = async (req, res) => {
  try {
    const repositories = await Repository.find({
      owner: req.user._id,
    }).select("name githubUrl createdAt status");

    return res.status(200).json({
      success: true,
      count: repositories.length,
      repositories,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const cloneRepository = async (req, res) => {
  try {
    const { id } = req.params;

    const repository = await Repository.findOne({
      _id: id,
      owner: req.user._id,
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    const destination = path.join(
      REPOSITORY_STORAGE_PATH,
      repository._id.toString()
    );

    repository.status = "CLONING";
    repository.localPath = destination;

    // Save immediately so DB reflects current state
    await repository.save();

    let analysis;

    try {
      // Clone repository
      await cloneRepositoryService(
        repository.cloneUrl,
        repository.localPath
      );

      // Analyze project
      analysis = await analyzeProject(repository.localPath);

      // Save analysis
      repository.analysis = analysis;

      // Clone completed
      repository.status = "CLONED";
      await repository.save();

      // Generate Dockerfile
      const dockerfile = generateDockerfile(repository.analysis);

      // Write Dockerfile
      await writeDockerfile(
        repository.localPath,
        dockerfile
      );

      // Build Docker Image
      repository.status = "BUILDING";
      await repository.save();

      const dockerInfo = await buildDockerImage(
        repository.localPath,
        `reporunner-${repository._id}`
      );

      repository.docker = dockerInfo;
      repository.status = "BUILT";

      await repository.save();

    } catch (error) {
      repository.status = "FAILED";
      await repository.save();

      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "Repository cloned and Docker image built successfully",
      repository: {
        id: repository._id,
        name: repository.name,
        status: repository.status,
      },
      analysis: repository.analysis,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};