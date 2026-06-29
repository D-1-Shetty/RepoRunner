import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

export default generateToken;