"use client";
import { useEffect } from "react";
import { registerSearch } from "./CommandPalette";
import { search } from "@/lib/search-client";

export function SearchBootstrap() {
  useEffect(() => registerSearch((q) => search(q, 20)), []);
  return null;
}
