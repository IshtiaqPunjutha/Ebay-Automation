const ALLOWED_IMAGE_HOST = "i.ebayimg.com";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "FETCH_EBAY_PRODUCT_IMAGE") return;

  (async () => {
    const imageUrl = new URL(message.imageUrl);
    if (imageUrl.protocol !== "https:" || imageUrl.hostname !== ALLOWED_IMAGE_HOST) {
      throw new Error("Only eBay product images are supported.");
    }

    const response = await fetch(imageUrl, { redirect: "error" });
    if (!response.ok) throw new Error("Could not download the eBay image.");

    const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const image = new Uint8Array(await response.arrayBuffer());
    if (!ALLOWED_CONTENT_TYPES.has(contentType) || image.length === 0 || image.length > MAX_IMAGE_BYTES) {
      throw new Error("The eBay image format or size is not supported.");
    }

    return { contentType, base64: toBase64(image) };
  })()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});