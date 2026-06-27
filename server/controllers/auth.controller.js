import User from "../models/user.model.js";

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
const existingUser = await User.findOne({ email });

if (existingUser) {
  return res.status(409).json({
    success: false,
    message: "User already exists",
  });
}

    res.status(200).json({
      success: true,
      message: "Validation passed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};