import crypto from "crypto";

// AES-256-GCM authenticated encryption for stored deployment environment
// values. There is NO plaintext fallback: if CONFIG_ENCRYPTION_KEY is
// missing or invalid, encrypt()/decrypt() throw. Error messages never
// contain key material or plaintext.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // standard GCM nonce length
const KEY_BYTES = 32; // AES-256
const SEPARATOR = ":";

// Resolves and validates CONFIG_ENCRYPTION_KEY on demand. Throws a clear,
// secret-free error when the key is absent or is not a base64-encoded
// 32-byte value.
const getKey = () => {
  const raw = process.env.CONFIG_ENCRYPTION_KEY;

  if (!raw || raw.trim() === "") {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY is not set - cannot encrypt or decrypt deployment environment values."
    );
  }

  const key = Buffer.from(raw.trim(), "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CONFIG_ENCRYPTION_KEY must be a base64-encoded ${KEY_BYTES}-byte key.`
    );
  }

  return key;
};

// encrypt(value: string) -> "iv:tag:ciphertext" (each segment base64).
export const encrypt = (value) => {
  if (typeof value !== "string") {
    throw new Error("encrypt() expects a string value.");
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(SEPARATOR);
};

// decrypt(payload: "iv:tag:ciphertext") -> plaintext string. Throws if the
// key is missing/invalid, the payload is malformed, or authentication fails.
export const decrypt = (payload) => {
  if (typeof payload !== "string") {
    throw new Error("decrypt() expects a string payload.");
  }

  const parts = payload.split(SEPARATOR);

  if (parts.length !== 3) {
    throw new Error("Encrypted value is malformed.");
  }

  const key = getKey();
  const [ivB64, tagB64, dataB64] = parts;

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");

  if (iv.length !== IV_BYTES) {
    throw new Error("Encrypted value has an invalid IV.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
};
