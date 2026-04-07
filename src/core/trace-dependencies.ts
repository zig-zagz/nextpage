import path from "node:path";
import { promises as fs } from "node:fs";

import type {
  ContextFile,
  ExcludeCategory,
  FocusMode,
  IncludeCategory,
  IncludedFile,
  ProjectInfo,
  TraceMode,
  TraceResult,
} from "../types.js";
import { classifyFile, matchesExcludedCategory, shouldIncludeCategory } from "./classify-file.js";
import { parseImportSpecifiers } from "./parse-imports.js";
import { isResolveSuccess, resolveImport } from "./resolve-import.js";

interface QueueItem {
  filePath: string;
  reason: string;
  depth: number;
  forceInclude: boolean;
}

function toRelative(project: ProjectInfo, filePath: string): string {
  return path.relative(project.root, filePath) || path.basename(filePath);
}

function isClientModule(content: string): boolean {
  return /^\s*["']use client["'];/m.test(content);
}

function isWithinDirectory(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getLocalityScore(anchorDirectory: string | undefined, filePath: string, project: ProjectInfo): number {
  if (!anchorDirectory) {
    return 3;
  }

  if (isWithinDirectory(anchorDirectory, filePath)) {
    return 0;
  }

  const anchorParent = path.dirname(anchorDirectory);
  if (isWithinDirectory(anchorParent, filePath)) {
    return 1;
  }

  if (isWithinDirectory(project.appDir, filePath)) {
    return 2;
  }

  return 3;
}

export async function traceDependencies(
  project: ProjectInfo,
  entryFile: string,
  contextFiles: ContextFile[],
  options: {
    entryReason: string;
    focus: FocusMode;
    trace: TraceMode;
    include: IncludeCategory[];
    exclude: ExcludeCategory[];
    anchorDirectory?: string | undefined;
    maxDepth?: number | undefined;
    maxFiles?: number | undefined;
    maxChars?: number | undefined;
  },
): Promise<TraceResult> {
  const queue: QueueItem[] = [
    { filePath: entryFile, reason: options.entryReason, depth: 0, forceInclude: true },
    ...contextFiles.map((item) => ({
      filePath: item.path,
      reason: item.reason,
      depth: 0,
      forceInclude: true,
    })),
  ];

  const includedFiles: IncludedFile[] = [];
  const skippedImports: TraceResult["skippedImports"] = [];
  const visited = new Set<string>();
  const enqueued = new Set(queue.map((item) => item.filePath));
  const contentCache = new Map<string, string>();
  let totalCharacters = 0;
  let truncated = false;
  const truncationReasons: string[] = [];

  async function readContent(filePath: string): Promise<string> {
    const cached = contentCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    const content = await fs.readFile(filePath, "utf8");
    contentCache.set(filePath, content);
    return content;
  }

  async function getQueuePriority(item: QueueItem): Promise<number> {
    const classification = classifyFile(project, item.filePath);
    let score = item.depth;

    if (!item.forceInclude) {
      if (!shouldIncludeCategory(classification, options.include)) {
        score += 1000;
      }

      if (matchesExcludedCategory(classification, options.exclude)) {
        score += 500;
      }
    }

    if (options.trace === "local") {
      score += getLocalityScore(options.anchorDirectory, item.filePath, project) * 10;
    } else if (options.trace === "full") {
      score += getLocalityScore(options.anchorDirectory, item.filePath, project) * 2;
    }

    if (options.focus !== "all" && classification.category === "code") {
      const content = await readContent(item.filePath);
      const clientFile = isClientModule(content);
      if (options.focus === "client") {
        score += clientFile ? -50 : 10;
      } else if (options.focus === "server") {
        score += clientFile ? 25 : -5;
      }
    }

    return score;
  }

  async function pullNextQueueItem(): Promise<QueueItem | undefined> {
    if (queue.length === 0) {
      return undefined;
    }

    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < queue.length; index += 1) {
      const score = await getQueuePriority(queue[index]!);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [item] = queue.splice(bestIndex, 1);
    return item;
  }

  while (queue.length > 0) {
    const current = await pullNextQueueItem();
    if (!current) {
      break;
    }

    if (visited.has(current.filePath)) {
      continue;
    }

    const classification = classifyFile(project, current.filePath);
    if (!current.forceInclude) {
      if (!shouldIncludeCategory(classification, options.include)) {
        visited.add(current.filePath);
        continue;
      }

      if (matchesExcludedCategory(classification, options.exclude)) {
        visited.add(current.filePath);
        continue;
      }
    }

    if (options.maxFiles !== undefined && includedFiles.length >= options.maxFiles) {
      truncated = true;
      truncationReasons.push(`Stopped after reaching max file count (${options.maxFiles}).`);
      break;
    }

    const content = await readContent(current.filePath);
    if (options.maxChars !== undefined && totalCharacters + content.length > options.maxChars) {
      truncated = true;
      truncationReasons.push(`Stopped after reaching max character count (${options.maxChars}).`);
      break;
    }

    visited.add(current.filePath);
    totalCharacters += content.length;
    includedFiles.push({
      path: current.filePath,
      relativePath: toRelative(project, current.filePath),
      reason: current.reason,
      content,
      isClient: classification.category === "code" ? isClientModule(content) : false,
      depth: current.depth,
      category: classification.category,
    });

    if (options.trace === "direct" && current.depth >= 1) {
      continue;
    }

    if (options.maxDepth !== undefined && current.depth >= options.maxDepth) {
      continue;
    }

    const importSpecifiers = parseImportSpecifiers(current.filePath, content);
    for (const specifier of importSpecifiers) {
      const resolved = await resolveImport(specifier, current.filePath, project);
      if (!isResolveSuccess(resolved)) {
        skippedImports.push({
          from: toRelative(project, current.filePath),
          specifier,
          reason: resolved.reason,
        });
        continue;
      }

      const resolvedPath = path.normalize(resolved.resolvedPath);
      if (visited.has(resolvedPath) || enqueued.has(resolvedPath)) {
        continue;
      }

      enqueued.add(resolvedPath);
      queue.push({
        filePath: resolvedPath,
        reason: `imported by ${toRelative(project, current.filePath)}`,
        depth: current.depth + 1,
        forceInclude: false,
      });
    }
  }

  return {
    includedFiles,
    skippedImports,
    totalCharacters,
    truncated,
    truncationReasons,
  };
}
