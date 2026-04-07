import path from "node:path";

import type { ExcludeCategory, IncludeCategory, ProjectInfo } from "../types.js";

export interface FileClassification {
  category: "code" | "style" | "json" | "other";
  excludeMatches: Set<ExcludeCategory>;
}

const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);

function hasPathSegment(relativePath: string, segment: string): boolean {
  const parts = relativePath.split(path.sep);
  return parts.includes(segment);
}

export function classifyFile(project: ProjectInfo, filePath: string): FileClassification {
  const relativePath = path.relative(project.root, filePath);
  const baseName = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();
  const excludeMatches = new Set<ExcludeCategory>();

  if (STYLE_EXTENSIONS.has(extension)) {
    if (baseName.endsWith(".module.css") || baseName.endsWith(".module.scss")) {
      return { category: "style", excludeMatches };
    }
    return { category: "style", excludeMatches };
  }

  if (extension === ".json") {
    return { category: "json", excludeMatches };
  }

  if (baseName.includes(".test.") || baseName.includes(".spec.") || hasPathSegment(relativePath, "__tests__")) {
    excludeMatches.add("tests");
  }

  if (baseName.includes(".stories.")) {
    excludeMatches.add("stories");
  }

  if (hasPathSegment(relativePath, "__mocks__") || hasPathSegment(relativePath, "mocks") || baseName.startsWith("mock.")) {
    excludeMatches.add("mocks");
  }

  if (hasPathSegment(relativePath, "generated") || hasPathSegment(relativePath, "__generated__") || baseName.endsWith(".generated.ts") || baseName.endsWith(".generated.tsx")) {
    excludeMatches.add("generated");
  }

  if (hasPathSegment(relativePath, "icons") || baseName.includes("icon")) {
    excludeMatches.add("icons");
  }

  if (hasPathSegment(relativePath, "analytics") || hasPathSegment(relativePath, "telemetry") || baseName.includes("analytics") || baseName.includes("telemetry") || baseName.includes("tracking")) {
    excludeMatches.add("analytics");
  }

  if (hasPathSegment(relativePath, "utils") || hasPathSegment(relativePath, "helpers")) {
    excludeMatches.add("utils");
  }

  return { category: "code", excludeMatches };
}

export function shouldIncludeCategory(
  classification: FileClassification,
  include: IncludeCategory[],
): boolean {
  if (classification.category === "style") {
    return include.includes("styles");
  }

  if (classification.category === "json") {
    return include.includes("json");
  }

  return true;
}

export function matchesExcludedCategory(
  classification: FileClassification,
  exclude: ExcludeCategory[],
): boolean {
  return exclude.some((category) => classification.excludeMatches.has(category));
}
