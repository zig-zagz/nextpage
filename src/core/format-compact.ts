import path from "node:path";

import type { IncludedFile, PackResult } from "../types.js";

function languageFromExtension(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension === "" ? "txt" : extension;
}

function chooseFence(content: string): string {
  return content.includes("```") ? "````" : "```";
}

function formatFile(file: IncludedFile): string {
  const fence = chooseFence(file.content);
  return [
    `## ${file.relativePath}`,
    `Reason: ${file.reason}`,
    "",
    `${fence}${languageFromExtension(file.path)}`,
    file.content,
    fence,
    "",
  ].join("\n");
}

export function formatCompact(result: Omit<PackResult, "output">): string {
  const lines: string[] = [];

  lines.push("# Bundle");
  lines.push(`Target: ${result.target}`);
  lines.push(`Type: ${result.targetType}`);
  lines.push(`Entry: ${path.relative(result.project.root, result.entryFile)}`);
  lines.push(`Files: ${result.trace.includedFiles.length}`);

  if (result.trace.truncated) {
    lines.push("Truncated: yes");
  }

  lines.push("");

  for (const file of result.trace.includedFiles) {
    lines.push(formatFile(file));
  }

  return lines.join("\n").trimEnd() + "\n";
}
