import Repository from "../models/repository.model.js";
import validateGithubUrl from "../utils/validateGithubUrl.js";
import extractGithubInfo from "../utils/extractGithubInfo.js";
import { cloneRepositoryWorkflow } from "../services/repository.workflow.js";
import {getRepository} from "../services/github.service.js";




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

    repository.localPath = path.join(
      REPOSITORY_STORAGE_PATH,
      repository._id.toString()
    );

    const deployedRepository =
      await cloneRepositoryWorkflow(repository);

    return res.status(200).json({
      success: true,
      message: "Repository deployed successfully",
      repository: deployedRepository,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const stopRepository = async (req,res)=>{

    await stopContainer(
        repository.docker.containerId
    );

}