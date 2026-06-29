import Repository from "../models/repository.model.js";

export const importRepository = async (req, res) => {
  try {
    const { name, githubUrl } = req.body;

    if (!name || !githubUrl) {
      return res.status(400).json({
        success: false,
        message: "Repository name and GitHub URL are required",
      });
    }

    res.status(201).json({
      success: true,
      message: "Validation passed",
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};