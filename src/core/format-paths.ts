import type { PackResult } from "../types.js";

export function formatPaths(result: Omit<PackResult, "output">): string {
  const lines = [
    `Target: ${result.target}`,
    `Type: ${result.targetType}`,
    ...result.trace.includedFiles.map((file) => `${file.relativePath} (${file.reason})`),
  ];

  return lines.join("\n").trimEnd() + "\n";
}
