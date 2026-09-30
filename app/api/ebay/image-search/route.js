import { NextResponse } from "next/server";

const ALLOWED_IMAGE_HOSTS = new Set(["i.ebayimg.com"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function GET(request) {
  const imageValue = new URL(request.url).searchParams.get("url");
  if (!imageValue) {
    return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
  }

  let imageUrl;
  try {
    imageUrl = new URL(imageValue);
  } catch {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  if (imageUrl.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(imageUrl.hostname)) {
    return NextResponse.json({ error: "Only eBay product images are supported" }, { status: 400 });
  }

  try {
    const response = await fetch(imageUrl, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return NextResponse.json({ error: "Could not retrieve product image" }, { status: 502 });
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const contentLength = Number(response.headers.get("content-length"));
    if (!ALLOWED_CONTENT_TYPES.has(contentType) || contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Unsupported or oversized product image" }, { status: 415 });
    }

    const image = await response.arrayBuffer();
    if (image.byteLength === 0 || image.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Unsupported or oversized product image" }, { status: 415 });
    }

    return new Response(image, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("eBay image proxy failed:", error);
    return NextResponse.json({ error: "Could not retrieve product image" }, { status: 502 });
  }
}