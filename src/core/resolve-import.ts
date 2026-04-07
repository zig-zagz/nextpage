import path from "node:path";
import ts from "typescript";

import type { AliasPattern, ProjectInfo } from "../types.js";
import { isFile } from "../utils/fs.js";

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".less",
] as const;

interface ResolveImportSuccess {
  resolvedPath: string;
}

interface ResolveImportFailure {
  reason: string;
}

export type ResolveImportResult = ResolveImportSuccess | ResolveImportFailure;

function isResolveSuccess(result: ResolveImportResult): result is ResolveImportSuccess {
  return "resolvedPath" in result;
}

function isWithinProjectRoot(projectRoot: string, targetPath: string): boolean {
  const relative = path.relative(projectRoot, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

function matchAliasTargets(specifier: string, aliases: AliasPattern[]): string[] {
  const results: string[] = [];

  for (const alias of aliases) {
    const hasWildcard = alias.key.includes("*");
    if (!hasWildcard) {
      if (specifier === alias.key) {
        results.push(...alias.targets);
      }
      continue;
    }

    if (!specifier.startsWith(alias.prefix) || !specifier.endsWith(alias.suffix)) {
      continue;
    }

    const wildcardValue = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length);
    for (const targetPattern of alias.targets) {
      results.push(targetPattern.replace("*", wildcardValue));
    }
  }

  return results;
}

async function resolveFromBasePath(basePath: string): Promise<string | undefined> {
  const directPath = path.resolve(basePath);
  if (await isFile(directPath)) {
    return directPath;
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const withExtension = `${directPath}${extension}`;
    if (await isFile(withExtension)) {
      return withExtension;
    }
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const asIndexFile = path.join(directPath, `index${extension}`);
    if (await isFile(asIndexFile)) {
      return asIndexFile;
    }
  }

  return undefined;
}

async function resolveViaTs(
  specifier: string,
  containingFile: string,
  project: ProjectInfo,
): Promise<string | undefined> {
  const result = ts.resolveModuleName(specifier, containingFile, project.compilerOptions, ts.sys);
  const resolved = result.resolvedModule?.resolvedFileName;
  if (!resolved) {
    return undefined;
  }

  const normalized = path.normalize(resolved);
  if (normalized.includes(`${path.sep}node_modules${path.sep}`)) {
    return undefined;
  }

  if (!isWithinProjectRoot(project.root, normalized)) {
    return undefined;
  }

  return normalized;
}

async function resolveViaManualCandidates(
  specifier: string,
  containingFile: string,
  project: ProjectInfo,
): Promise<string | undefined> {
  const containingDirectory = path.dirname(containingFile);
  const candidates: string[] = [];

  if (specifier.startsWith(".")) {
    candidates.push(path.resolve(containingDirectory, specifier));
  }

  if (specifier.startsWith("/")) {
    candidates.push(path.resolve(project.root, `.${specifier}`));
    candidates.push(path.resolve(project.root, specifier.slice(1)));
  }

  for (const aliasTarget of matchAliasTargets(specifier, project.aliasPatterns)) {
    candidates.push(aliasTarget);
  }

  if (project.compilerOptions.baseUrl && isBareSpecifier(specifier)) {
    const baseUrl = path.resolve(project.root, project.compilerOptions.baseUrl);
    candidates.push(path.resolve(baseUrl, specifier));
  }

  for (const candidate of candidates) {
    const resolved = await resolveFromBasePath(candidate);
    if (!resolved) {
      continue;
    }

    if (!isWithinProjectRoot(project.root, resolved)) {
      continue;
    }

    return resolved;
  }

  return undefined;
}

export async function resolveImport(
  specifier: string,
  containingFile: string,
  project: ProjectInfo,
): Promise<ResolveImportResult> {
  const tsResolved = await resolveViaTs(specifier, containingFile, project);
  if (tsResolved) {
    return { resolvedPath: tsResolved };
  }

  const manualResolved = await resolveViaManualCandidates(specifier, containingFile, project);
  if (manualResolved) {
    return { resolvedPath: manualResolved };
  }

  if (isBareSpecifier(specifier) && matchAliasTargets(specifier, project.aliasPatterns).length === 0) {
    return { reason: "external package import" };
  }

  return { reason: "could not resolve local import" };
}

export { isResolveSuccess };
