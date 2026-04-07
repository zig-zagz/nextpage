import path from "node:path";
import ts from "typescript";

import { NextDistilError } from "../errors.js";
import type { AliasPattern, ProjectInfo } from "../types.js";
import { findUp, isDirectory, pathExists, readJsonFile } from "../utils/fs.js";

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function buildAliasPatterns(
  compilerOptions: ts.CompilerOptions,
  projectRoot: string,
): AliasPattern[] {
  const paths = compilerOptions.paths ?? {};
  const baseUrl = compilerOptions.baseUrl
    ? path.resolve(projectRoot, compilerOptions.baseUrl)
    : projectRoot;

  return Object.entries(paths).map(([key, values]) => {
    const [rawPrefix, rawSuffix = ""] = key.split("*");
    const prefix = rawPrefix ?? "";
    const suffix = rawSuffix;
    return {
      key,
      prefix,
      suffix,
      targets: values.map((target) => path.resolve(baseUrl, target)),
    };
  });
}

function loadCompilerOptions(projectRoot: string): {
  tsconfigPath?: string;
  compilerOptions: ts.CompilerOptions;
  aliasPatterns: AliasPattern[];
} {
  const configCandidates = ["tsconfig.json", "jsconfig.json"];

  for (const fileName of configCandidates) {
    const configPath = path.join(projectRoot, fileName);
    if (!ts.sys.fileExists(configPath)) {
      continue;
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
      throw new NextDistilError(`Failed to read ${fileName}: ${message}`);
    }

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot, undefined, configPath);
    if (parsed.errors.length > 0) {
      const details = parsed.errors.map((error) =>
        ts.flattenDiagnosticMessageText(error.messageText, "\n"),
      );
      throw new NextDistilError(`Failed to parse ${fileName}.`, details);
    }

    const compilerOptions: ts.CompilerOptions = {
      ...parsed.options,
      allowJs: true,
      resolveJsonModule: true,
    };

    return {
      tsconfigPath: configPath,
      compilerOptions,
      aliasPatterns: buildAliasPatterns(compilerOptions, projectRoot),
    };
  }

  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    resolveJsonModule: true,
  };

  return {
    compilerOptions,
    aliasPatterns: buildAliasPatterns(compilerOptions, projectRoot),
  };
}

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const packageJsonPath = await findUp(cwd, "package.json");
  if (!packageJsonPath) {
    throw new NextDistilError("No package.json found in this directory or its parents.");
  }

  const root = path.dirname(packageJsonPath);
  const packageJson = await readJsonFile<PackageJsonShape>(packageJsonPath);
  const hasNextDependency = Boolean(
    packageJson.dependencies?.next ?? packageJson.devDependencies?.next,
  );

  const appDirCandidates = [path.join(root, "app"), path.join(root, "src", "app")];
  const appDir = await (async () => {
    for (const candidate of appDirCandidates) {
      if (await isDirectory(candidate)) {
        return candidate;
      }
    }
    return undefined;
  })();

  if (!hasNextDependency && !appDir) {
    throw new NextDistilError(
      "No Next.js project detected in this directory or its parents.",
      ["Expected a `next` dependency and an `app/` or `src/app/` directory."],
    );
  }

  if (!appDir) {
    throw new NextDistilError(
      "This project does not appear to use the Next.js App Router.",
      ["Expected an `app/` or `src/app/` directory."],
    );
  }

  const { tsconfigPath, compilerOptions, aliasPatterns } = loadCompilerOptions(root);

  if (tsconfigPath && !(await pathExists(tsconfigPath))) {
    throw new NextDistilError(`Resolved tsconfig path does not exist: ${tsconfigPath}`);
  }

  return {
    root,
    packageJsonPath,
    appDir,
    tsconfigPath,
    compilerOptions,
    aliasPatterns,
  };
}
