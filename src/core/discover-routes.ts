import path from "node:path";

import type { DiscoveredRoute, ProjectInfo } from "../types.js";
import { walkFiles } from "../utils/fs.js";

const PAGE_FILE_PATTERN = /^page\.(tsx|ts|jsx|js)$/;
const ROUTE_GROUP_PATTERN = /^\(.*\)$/;
const PARALLEL_ROUTE_PATTERN = /^@/;

function shouldIgnoreSegment(segment: string): boolean {
  return ROUTE_GROUP_PATTERN.test(segment) || PARALLEL_ROUTE_PATTERN.test(segment);
}

function toPublicSegments(routeDirRelative: string): string[] {
  if (routeDirRelative === "") {
    return [];
  }

  return routeDirRelative
    .split(path.sep)
    .filter((segment) => segment.length > 0)
    .filter((segment) => !shouldIgnoreSegment(segment));
}

function toPublicRoute(segments: string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export async function discoverRoutes(project: ProjectInfo): Promise<DiscoveredRoute[]> {
  const files = await walkFiles(project.appDir);
  const routes: DiscoveredRoute[] = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    if (!PAGE_FILE_PATTERN.test(fileName)) {
      continue;
    }

    const routeDir = path.dirname(filePath);
    const routeDirRelative = path.relative(project.appDir, routeDir);
    const rawSegments = routeDirRelative === "" ? [] : routeDirRelative.split(path.sep);
    const publicSegments = toPublicSegments(routeDirRelative);

    routes.push({
      route: toPublicRoute(publicSegments),
      entryFile: filePath,
      routeDir,
      rawSegments,
      publicSegments,
    });
  }

  return routes.sort((a, b) => a.route.localeCompare(b.route) || a.entryFile.localeCompare(b.entryFile));
}
