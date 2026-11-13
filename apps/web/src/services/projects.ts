import { Program, validateProgram } from "../../../engine/src/studio/model";
import type { StudioResult } from "../../../engine/src/studio/simulate";
import type { NoiseSettings } from "../types";
export interface Project {
  id: string;
  name: string;
  program: Program;
  updated: string;
}
export interface Job {
  id: string;
  name: string;
  created: string;
  program: Program;
  shots: number;
  seed: number;
  noise: NoiseSettings;
  status: "completed" | "failed" | "cancelled";
  result?: StudioResult;
  error?: string;
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function saveStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function importProject(text: string): {
  name: string;
  program: Program;
} {
  const file = JSON.parse(text);
  const program = file.program ?? file;
  validateProgram(program);
  return {
    name:
      typeof file.name === "string"
        ? file.name.slice(0, 80)
        : "Imported project",
    program,
  };
}
