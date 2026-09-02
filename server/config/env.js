import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT;
export const MONGO_URI = process.env.MONGO_URI;
export const JWT_SECRET = process.env.JWT_SECRET;

// Base64-encoded 32-byte key for encrypting stored deployment environment
// values. Not validated at startup - server/utils/secretbox.js validates it
// on demand and fails clearly if it is missing/invalid when a value is saved.
export const CONFIG_ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;