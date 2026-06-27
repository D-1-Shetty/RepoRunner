import mongoose from "mongoose";
import colors from "colors";
import { MONGO_URI } from "../config/env.js";

const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      console.warn("MONGO_URI is not set; skipping MongoDB connection".yellow.bold);
      return false;
    }

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB Connected".green.bold);
    return true;
  } catch (error) {
    console.log(`Database Error: ${error.message}`.red.bold);
    return false;
  }
};

export default connectDB;