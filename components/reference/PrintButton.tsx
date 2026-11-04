"use client";
import { Printer } from "lucide-react";

/** Opens the browser's print dialog; the print stylesheet (app/styles/reference.css) lays the sheet out for paper. */
export function PrintButton() {
  return (
    <button type="button" className="fm-btn" onClick={() => window.print()}>
      <Printer size={16} aria-hidden /> Print
    </button>
  );
}
