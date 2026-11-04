"use client";
import { createContext } from "react";
import type { Faults, SimState } from "@/lib/studio/sim/types";
import { NO_FAULTS } from "./useRun";

/** What canvas nodes and edges need to draw Run mode. `on` is false in Edit mode, and then nothing else is read. */
export interface RunView { on: boolean; state: SimState | null; faults: Faults }
export const RunViewContext = createContext<RunView>({ on: false, state: null, faults: NO_FAULTS });
