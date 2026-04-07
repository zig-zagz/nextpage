import path from "node:path";

import { NextPackAiError } from "../errors.js";
import type { DiscoveredRoute, ProjectInfo, SelectedTarget, TargetType } from "../types.js";
import { isFile } from "../utils/fs.js";
import { normalizeRoute } from "../utils/path.js";
import { resolveRoute } from "./resolve-route.js";

function isWithinDirectory(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveFileTarget(
  project: ProjectInfo,
  cwd: string,
  target: string,
): Promise<SelectedTarget> {
  const candidate = path.isAbsolute(target) ? path.normalize(target) : path.resolve(cwd, target);
  if (!(await isFile(candidate))) {
    throw new NextPackAiError(`Could not resolve file target ${target}.`);
  }

  if (!isWithinDirectory(project.root, candidate)) {
    throw new NextPackAiError(
      `File target ${target} is outside the detected project root.`,
      [project.root],
    );
  }

  const routeDir = isWithinDirectory(project.appDir, path.dirname(candidate))
    ? path.dirname(candidate)
    : undefined;

  return {
    targetType: "file",
    target: path.relative(project.root, candidate),
    entryFile: candidate,
    routeDir,
  };
}

async function inferTargetType(cwd: string, target: string): Promise<TargetType> {
  if (!target.startsWith("/")) {
    return "file";
  }

  const candidate = path.isAbsolute(target) ? path.normalize(target) : path.resolve(cwd, target);
  if (await isFile(candidate)) {
    return "file";
  }

  return "route";
}

export async function selectTarget(args: {
  project: ProjectInfo;
  cwd: string;
  target: string;
  targetType?: TargetType | undefined;
  discoveredRoutes: DiscoveredRoute[];
}): Promise<SelectedTarget> {
  const targetType = args.targetType ?? await inferTargetType(args.cwd, args.target);

  if (targetType === "file") {
    return resolveFileTarget(args.project, args.cwd, args.target);
  }

  const normalizedRoute = normalizeRoute(args.target);
  const resolution = resolveRoute(normalizedRoute, args.discoveredRoutes);

  return {
    targetType: "route",
    target: resolution.route,
    route: resolution.route,
    entryFile: resolution.entryFile,
    routeDir: resolution.routeDir,
  };
}
