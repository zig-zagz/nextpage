import path from "node:path";

import type { ContextFile, IncludeCategory, ProjectInfo } from "../types.js";
import { isFile } from "../utils/fs.js";

const FILE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];
const ROUTE_LOCAL_BASENAMES = ["template", "loading", "error", "not-found"];
const STYLE_EXTENSIONS = ["css", "module.css", "scss", "module.scss", "sass", "less"];

async function findExistingFileCandidates(basePathWithoutExtension: string): Promise<string[]> {
  const results: string[] = [];
  for (const extension of FILE_EXTENSIONS) {
    const candidate = `${basePathWithoutExtension}.${extension}`;
    if (await isFile(candidate)) {
      results.push(candidate);
    }
  }
  return results;
}

export async function collectContextFiles(
  project: ProjectInfo,
  args: {
    routeDir?: string | undefined;
    entryFile: string;
    include: IncludeCategory[];
    includeLayouts: boolean;
    includeRouteFiles: boolean;
  },
): Promise<ContextFile[]> {
  if (!args.routeDir) {
    return [];
  }

  const routeRelativeDir = path.relative(project.appDir, args.routeDir);
  if (routeRelativeDir.startsWith("..") || path.isAbsolute(routeRelativeDir)) {
    return [];
  }

  const routeSegments = routeRelativeDir === "" ? [] : routeRelativeDir.split(path.sep);
  const contextFiles: ContextFile[] = [];
  const seen = new Set<string>([args.entryFile]);

  if (args.includeLayouts) {
    for (let index = 0; index <= routeSegments.length; index += 1) {
      const currentDir = path.join(project.appDir, ...routeSegments.slice(0, index));
      const layouts = await findExistingFileCandidates(path.join(currentDir, "layout"));
      for (const layoutPath of layouts) {
        if (seen.has(layoutPath)) {
          continue;
        }
        seen.add(layoutPath);
        contextFiles.push({
          path: layoutPath,
          reason: index === 0 ? "root layout" : "ancestor layout",
        });
      }
    }
  }

  if (args.includeRouteFiles) {
    for (const baseName of ROUTE_LOCAL_BASENAMES) {
      const files = await findExistingFileCandidates(path.join(args.routeDir, baseName));
      for (const filePath of files) {
        if (seen.has(filePath)) {
          continue;
        }
        seen.add(filePath);
        contextFiles.push({
          path: filePath,
          reason: `route ${baseName}`,
        });
      }
    }
  }

  if (args.include.includes("styles")) {
    for (const extension of STYLE_EXTENSIONS) {
      const stylePath = path.join(args.routeDir, `page.${extension}`);
      if (seen.has(stylePath) || !(await isFile(stylePath))) {
        continue;
      }
      seen.add(stylePath);
      contextFiles.push({
        path: stylePath,
        reason: "route style",
      });
    }
  }

  return contextFiles;
}
