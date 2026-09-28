import { createHash, randomUUID } from "node:crypto";
import { kv } from "@vercel/kv";

function userKey(email) {
  const emailHash = createHash("sha256").update(email).digest("hex");
  return `app:user:${emailHash}`;
}

export async function getUserByEmail(email) {
  return await kv.get(userKey(email));
}

export async function createUser(email, passwordHash) {
  const user = { id: randomUUID(), email, passwordHash, createdAt: Date.now() };
  const result = await kv.set(userKey(email), user, { nx: true });
  return result ? user : null;
}