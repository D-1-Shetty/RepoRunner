import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
   if (!authHeader.startsWith("Bearer ")) {
  return res.status(401).json({
    success: false,
    message: "Invalid authorization format",
  });
}
    
   const token= authHeader.split(" ")[1];
     if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token not found",
      });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(decoded)

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};