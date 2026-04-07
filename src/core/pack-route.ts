import { collectContextFiles } from "./collect-context-files.js";
import { detectProject } from "./detect-project.js";
import { discoverRoutes } from "./discover-routes.js";
import { formatCompact } from "./format-compact.js";
import { formatBundle } from "./format-bundle.js";
import { formatPaths } from "./format-paths.js";
import { selectTarget } from "./select-target.js";
import { traceDependencies } from "./trace-dependencies.js";
import type { PackOptions, PackResult } from "../types.js";

export async function packRoute(options: PackOptions): Promise<PackResult> {
  const project = await detectProject(options.cwd);
  const discoveredRoutes = await discoverRoutes(project);
  const selection = await selectTarget({
    project,
    cwd: options.cwd,
    target: options.target,
    targetType: options.targetType,
    discoveredRoutes,
  });

  const includeLayouts = options.scope === "context" || options.include.includes("layouts");
  const includeRouteFiles = options.scope === "context" || options.include.includes("route-files");
  const contextFiles = (options.scope === "context" || includeLayouts || includeRouteFiles || options.include.includes("styles"))
    ? await collectContextFiles(project, {
      routeDir: selection.routeDir,
      entryFile: selection.entryFile,
      include: options.include,
      includeLayouts,
      includeRouteFiles,
    })
    : [];

  const trace = await traceDependencies(project, selection.entryFile, contextFiles, {
    entryReason: selection.targetType === "route" ? "route entry" : "file entry",
    focus: options.focus,
    trace: options.trace,
    include: options.include,
    exclude: options.exclude,
    anchorDirectory: selection.routeDir ?? project.appDir,
    maxDepth: options.maxDepth,
    maxFiles: options.maxFiles,
    maxChars: options.maxChars,
  });

  const partialResult = {
    project,
    target: selection.target,
    targetType: selection.targetType,
    entryFile: selection.entryFile,
    contextFiles,
    trace,
    format: options.format,
  };

  const output = (() => {
    if (options.format === "compact") {
      return formatCompact(partialResult);
    }

    if (options.format === "paths") {
      return formatPaths(partialResult);
    }

    return formatBundle(partialResult);
  })();

  return {
    ...partialResult,
    output,
  };
}
