"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE_CHOICES = [10, 25, 50, 100];

// Slice of a list for one page, with the numbers a pager shows. The page is clamped, so a shorter list
// (after a search) never leaves you on a page that no longer exists.
export function paginate(list, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    page: current,
    pageCount,
    first: list.length === 0 ? 0 : start + 1,
    last: Math.min(start + pageSize, list.length),
    total: list.length,
  };
}

// Same look as the orders pager. `info` comes from paginate().
export function Pager({ info, pageSize, onPageSize, onPage, label = "Per page" }) {
  return (
    <div className="pager">
      <label className="pager-size">
        {label}
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label={label}>
          {PAGE_SIZE_CHOICES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <span className="pager-info">
        Showing {info.first}–{info.last} of {info.total}
      </span>
      <div className="pager-nav">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(info.page - 1)} disabled={info.page <= 1}>
          <ChevronLeft strokeWidth={2} />
          Previous
        </button>
        <span className="pager-page">
          Page {info.page} of {info.pageCount}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(info.page + 1)} disabled={info.page >= info.pageCount}>
          Next
          <ChevronRight strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
