import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${Buffer.from(hash).toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;
  const [salt, expectedHex] = storedHash.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(expectedHex || "")) {
    return false;
  }
  const actual = Buffer.from(await scrypt(password, salt, KEY_LENGTH));
  return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}