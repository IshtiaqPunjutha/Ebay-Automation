const fs = require("node:fs");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

async function requestJson(url, options, requestName) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`eBay returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) {
    const message =
      data.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
      data.error_description ||
      data.error ||
      "No error details returned.";
    throw new Error(`${requestName} failed (${response.status}): ${message}`);
  }
  return data;
}

async function main() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set in .env.local.");
  }

  const existingJwe = process.env.EBAY_SIGNATURE_KEY_JWE;
  const existingPrivateKey = process.env.EBAY_SIGNATURE_PRIVATE_KEY;
  if (existingJwe || existingPrivateKey) {
    throw new Error("Signing-key variables already exist locally. Remove them before generating a replacement key.");
  }

  const appToken = await requestJson(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
    },
    "eBay application-token request"
  );

  const signingKey = await requestJson(
    "https://apiz.ebay.com/developer/key_management/v1/signing_key",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appToken.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signingKeyCipher: "ED25519" }),
    },
    "eBay signing-key creation"
  );

  if (!signingKey.jwe || !signingKey.privateKey) {
    throw new Error("eBay did not return both signing-key values; no local file was changed.");
  }

  const envPath = path.join(process.cwd(), ".env.local");
  const original = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lineEnding = original.includes("\r\n") ? "\r\n" : "\n";
  const variables = new Set(["EBAY_SIGNATURE_KEY_JWE", "EBAY_SIGNATURE_PRIVATE_KEY"]);
  const retainedLines = original
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.test(line) || !variables.has(line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/)?.[1]));
  const privateKey = signingKey.privateKey.replace(/\r?\n/g, "\\n");
  retainedLines.push(`EBAY_SIGNATURE_KEY_JWE=${signingKey.jwe}`);
  retainedLines.push(`EBAY_SIGNATURE_PRIVATE_KEY="${privateKey}"`);
  fs.writeFileSync(envPath, `${retainedLines.join(lineEnding).replace(/\r?\n*$/, "")}${lineEnding}`, "utf8");

  console.log(`Production signing key created${signingKey.signingKeyId ? ` (${signingKey.signingKeyId})` : ""} and saved to .env.local.`);
  console.log("The key values were not printed. Add the two EBAY_SIGNATURE_* variables from .env.local to Vercel Production settings.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});