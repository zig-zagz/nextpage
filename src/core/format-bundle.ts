import path from "node:path";

import type { IncludedFile, PackResult } from "../types.js";

function languageFromExtension(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (extension === "") {
    return "txt";
  }
  return extension;
}

function chooseFence(content: string): string {
  const hasTriple = content.includes("```");
  return hasTriple ? "````" : "```";
}

function formatFileBlock(file: IncludedFile): string {
  const fence = chooseFence(file.content);
  const language = languageFromExtension(file.path);

  return [
    `## FILE: ${file.relativePath}`,
    `Reason: ${file.reason}`,
    "",
    `${fence}${language}`,
    file.content,
    fence,
    "",
  ].join("\n");
}

export function formatBundle(result: Omit<PackResult, "output">): string {
  const lines: string[] = [];

  lines.push("# AI Refactor Bundle", "");
  lines.push(`- Target: \`${result.target}\``);
  lines.push(`- Target type: \`${result.targetType}\``);
  lines.push(`- Entry: \`${path.relative(result.project.root, result.entryFile)}\``);
  lines.push(`- Included files: ${result.trace.includedFiles.length}`);
  lines.push(`- Skipped imports: ${result.trace.skippedImports.length}`);
  lines.push(`- Total source characters: ${result.trace.totalCharacters}`);
  lines.push("");

  if (result.contextFiles.length > 0) {
    lines.push("## Context files", "");
    for (const context of result.contextFiles) {
      lines.push(`- \`${path.relative(result.project.root, context.path)}\` — ${context.reason}`);
    }
    lines.push("");
  }

  if (result.trace.truncated) {
    lines.push("## Truncation", "");
    for (const reason of result.trace.truncationReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }

  lines.push("## Included files", "");
  for (const file of result.trace.includedFiles) {
    lines.push(formatFileBlock(file));
  }

  if (result.trace.skippedImports.length > 0) {
    lines.push("## Skipped imports", "");
    for (const item of result.trace.skippedImports) {
      lines.push(`- \`${item.from}\` -> \`${item.specifier}\` (${item.reason})`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
