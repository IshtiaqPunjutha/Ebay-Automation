"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// eBay serves the same picture in many sizes, chosen by "s-l225" in the address.
// Ask for a bigger one for the popup.
export function largeImageUrl(url) {
  return /\/s-l\d+\.(jpg|jpeg|png|webp)/i.test(url || "")
    ? url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)/i, "/s-l800.$1")
    : url;
}

function Lightbox({ src, fallback, alt, onClose }) {
  const [shown, setShown] = useState(src);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Rendered into <body> so no table or sidebar layout can clip or move it.
  return createPortal(
    <div className="lightbox-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt || "Product image"}>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close image">
          <X strokeWidth={2.25} />
        </button>
        <img src={shown} alt={alt || ""} onError={() => shown !== fallback && fallback && setShown(fallback)} />
        {alt && <div className="lightbox-caption">{alt}</div>}
      </div>
    </div>,
    document.body
  );
}

// A small product picture that opens a large version in a popup when clicked.
// `src` is what the thumbnail shows (and falls back to if the large one fails).
export default function ZoomThumb({ src, alt, className = "thumb", onError }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="thumb-button"
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        aria-label={`Enlarge image${alt ? `: ${alt}` : ""}`}
      >
        <img className={className} src={src} alt={alt || ""} loading="lazy" onError={onError} />
      </button>
      {open && <Lightbox src={largeImageUrl(src)} fallback={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
