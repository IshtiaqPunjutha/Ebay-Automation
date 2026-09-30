(() => {
  const currentUrl = new URL(window.location.href);
  const imageUrl = currentUrl.searchParams.get("ebayImageSearch");
  if (!imageUrl) return;

  currentUrl.searchParams.delete("ebayImageSearch");
  window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);

  function showStatus(message, isError = false) {
    let status = document.getElementById("ebay-image-search-status");
    if (!status) {
      status = document.createElement("div");
      status.id = "ebay-image-search-status";
      Object.assign(status.style, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "2147483647",
        maxWidth: "360px",
        padding: "12px 16px",
        borderRadius: "6px",
        color: "#fff",
        background: "#202124",
        boxShadow: "0 4px 16px rgba(0,0,0,.25)",
        font: "14px/1.4 Arial, sans-serif",
      });
      document.body.append(status);
    }
    status.style.borderLeft = `4px solid ${isError ? "#d93025" : "#188038"}`;
    status.textContent = message;
  }

  function waitForElement(selector, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          clearTimeout(timeout);
          resolve(element);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error("AliExpress image search did not load in time."));
      }, timeoutMs);
    });
  }

  async function startImageSearch() {
    showStatus("Preparing the eBay image for AliExpress...");
    const imageResponse = await chrome.runtime.sendMessage({
      type: "FETCH_EBAY_PRODUCT_IMAGE",
      imageUrl,
    });
    if (!imageResponse?.ok) throw new Error(imageResponse?.error || "Could not load the eBay image.");

    const cameraButton = await waitForElement('img[alt="Search by image"]');
    cameraButton.click();

    const fileInput = await waitForElement('input[type="file"][accept*=".jpg"]');
    const binary = atob(imageResponse.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const extension = imageResponse.contentType === "image/png" ? "png" : imageResponse.contentType === "image/webp" ? "webp" : "jpg";
    const file = new File([bytes], `ebay-product.${extension}`, { type: imageResponse.contentType });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    showStatus("Image sent to AliExpress. Waiting for visual search results...");
  }

  startImageSearch().catch((error) => {
    console.error("AliExpress image search failed:", error);
    showStatus(error.message || "AliExpress image search failed.", true);
  });
})();