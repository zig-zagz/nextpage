#!/usr/bin/env node
import path from "node:path";
import { promises as fs } from "node:fs";

import clipboard from "clipboardy";
import { Command } from "commander";
import prompts from "prompts";

import { NextPackAiError } from "./errors.js";
import { detectProject } from "./core/detect-project.js";
import { discoverRoutes } from "./core/discover-routes.js";
import { packRoute } from "./core/pack-route.js";
import type {
  DiscoveredRoute,
  ExcludeCategory,
  FocusMode,
  IncludeCategory,
  OutputFormat,
  ScopeMode,
  TargetType,
  TraceMode,
} from "./types.js";
import { ensureDirectory } from "./utils/fs.js";
import { normalizeRoute, routeToSafeFileName } from "./utils/path.js";

interface CliOptions {
  mode?: ScopeMode;
  scope?: ScopeMode;
  targetType?: TargetType;
  focus?: FocusMode;
  trace?: TraceMode;
  format?: OutputFormat;
  include?: string;
  exclude?: string;
  save?: string;
  stdout: boolean;
  clipboard: boolean;
  discover: boolean;
  printConfig: boolean;
  maxDepth?: number;
  maxFiles?: number;
  maxChars?: number;
  verbose: boolean;
}

const INCLUDE_CATEGORIES: IncludeCategory[] = ["layouts", "route-files", "styles", "json"];
const EXCLUDE_CATEGORIES: ExcludeCategory[] = ["tests", "stories", "mocks", "generated", "icons", "analytics", "utils"];
const TARGET_TYPES: TargetType[] = ["route", "file"];
const FOCUS_MODES: FocusMode[] = ["client", "server", "all"];
const TRACE_MODES: TraceMode[] = ["direct", "local", "full"];
const OUTPUT_FORMATS: OutputFormat[] = ["compact", "markdown", "paths"];
const SCOPE_MODES: ScopeMode[] = ["strict", "context"];

function normalizeCommandArguments(argv: string[]): string[] {
  const [nodePath = "", scriptPath = "", command, ...rest] = argv;

  if (command === "pack") {
    return [nodePath, scriptPath, ...rest];
  }

  if (command === "discover") {
    return [nodePath, scriptPath, "--discover", ...rest];
  }

  if (command === "print-config") {
    return [nodePath, scriptPath, "--print-config", ...rest];
  }

  return argv;
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function assertAllowedValues<T extends string>(
  values: string[],
  allowed: readonly T[],
  flagName: string,
): T[] {
  const allowedSet = new Set<string>(allowed);
  for (const value of values) {
    if (!allowedSet.has(value)) {
      throw new NextPackAiError(`Invalid value for ${flagName}: ${value}.`, [
        `Allowed values: ${allowed.join(", ")}`,
      ]);
    }
  }

  return values as T[];
}

function assertAllowedValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flagName: string,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  const [validated] = assertAllowedValues([value], allowed, flagName);
  return validated;
}

function printDiscoveredRoutes(routes: DiscoveredRoute[], verbose: boolean): void {
  if (routes.length === 0) {
    console.log("No App Router pages were found.");
    return;
  }

  for (const route of routes) {
    if (verbose) {
      console.log(`${route.route} -> ${route.entryFile}`);
    } else {
      console.log(route.route);
    }
  }
}

async function promptForRoute(routes: DiscoveredRoute[]): Promise<string> {
  const uniqueRoutes = [...new Set(routes.map((item) => item.route))];

  if (uniqueRoutes.length > 0 && uniqueRoutes.length <= 30) {
    const response = await prompts({
      type: "select",
      name: "route",
      message: "Select a route to pack",
      choices: uniqueRoutes.map((route) => ({ title: route, value: route })),
    });

    if (!response.route) {
      throw new NextPackAiError("Route selection was cancelled.");
    }

    return response.route as string;
  }

  const response = await prompts({
    type: "text",
    name: "route",
    message: "Enter a public route (for example / or /home)",
    validate: (value: string) => (value.trim() ? true : "Route is required."),
  });

  if (!response.route) {
    throw new NextPackAiError("Route input was cancelled.");
  }

  return normalizeRoute(response.route as string);
}

async function writeOutput(savePath: string, output: string): Promise<string> {
  const absolutePath = path.resolve(savePath);
  await ensureDirectory(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, output, "utf8");
  return absolutePath;
}

function printSummary(args: {
  target: string;
  targetType: TargetType;
  entryFile: string;
  fileCount: number;
  skippedImportCount: number;
  totalCharacters: number;
  copied: boolean;
  savedPath?: string | undefined;
  verbose: boolean;
  contextFileCount: number;
}): void {
  console.log(`Target: ${args.target}`);
  console.log(`Target type: ${args.targetType}`);
  console.log(`Entry: ${args.entryFile}`);
  console.log(`Included files: ${args.fileCount}`);
  console.log(`Skipped imports: ${args.skippedImportCount}`);
  console.log(`Total characters: ${args.totalCharacters}`);

  if (args.verbose) {
    console.log(`Context files: ${args.contextFileCount}`);
  }

  if (args.copied) {
    console.log("Copied bundle to clipboard.");
  }

  if (args.savedPath) {
    console.log(`Saved bundle to ${args.savedPath}`);
  }
}

async function run(): Promise<void> {
  const normalizedArgv = normalizeCommandArguments(process.argv);
  const program = new Command();

  program
    .name("nextpage")
    .description("Flatten a Next.js route or file and its local context into one AI-friendly bundle.")
    .argument("[target]", "Public route such as / or /home, or a file path")
    .option("--scope <scope>", "Bundle scope: strict or context", "context")
    .option("--mode <scope>", "Alias for --scope")
    .option("--target-type <type>", "Target type: route or file")
    .option("--focus <focus>", "Focus mode: client, server, or all", "all")
    .option("--trace <trace>", "Trace mode: direct, local, or full", "full")
    .option("--format <format>", "Output format: compact, markdown, or paths", "compact")
    .option("--include <items>", "Comma-separated include categories")
    .option("--exclude <items>", "Comma-separated exclude categories")
    .option("--save <path>", "Save the generated bundle to a file")
    .option("--stdout", "Print the generated bundle to stdout", false)
    .option("--no-clipboard", "Do not copy the generated bundle to the clipboard")
    .option("--discover", "List discovered public routes and exit", false)
    .option("--print-config", "Print the resolved CLI options and exit", false)
    .option("--max-depth <number>", "Maximum import depth to trace", (value) => parsePositiveInteger(value, "--max-depth"))
    .option("--max-files <number>", "Maximum number of files to include", (value) => parsePositiveInteger(value, "--max-files"))
    .option("--max-chars <number>", "Maximum number of source characters to include", (value) => parsePositiveInteger(value, "--max-chars"))
    .option("--verbose", "Print more detail in the summary output", false)
    .showHelpAfterError();

  program.parse(normalizedArgv);

  const targetArgument = program.args[0] as string | undefined;
  const options = program.opts<CliOptions>();
  const scope = assertAllowedValue(options.scope ?? options.mode, SCOPE_MODES, "--scope") ?? "context";
  const targetType = assertAllowedValue(options.targetType, TARGET_TYPES, "--target-type");
  const focus = assertAllowedValue(options.focus, FOCUS_MODES, "--focus") ?? "all";
  const trace = assertAllowedValue(options.trace, TRACE_MODES, "--trace") ?? "full";
  const format = assertAllowedValue(options.format, OUTPUT_FORMATS, "--format") ?? "compact";
  const include = assertAllowedValues(parseCsvList(options.include), INCLUDE_CATEGORIES, "--include");
  const exclude = assertAllowedValues(parseCsvList(options.exclude), EXCLUDE_CATEGORIES, "--exclude");

  if (options.printConfig) {
    console.log(JSON.stringify({
      scope,
      targetType: targetType ?? null,
      focus,
      trace,
      format,
      include,
      exclude,
      save: options.save ?? null,
      stdout: options.stdout,
      clipboard: options.clipboard,
      discover: options.discover,
      maxDepth: options.maxDepth ?? null,
      maxFiles: options.maxFiles ?? null,
      maxChars: options.maxChars ?? null,
      verbose: options.verbose,
      targetArgument: targetArgument ?? null,
    }, null, 2));
    return;
  }

  const project = await detectProject(process.cwd());
  const routes = await discoverRoutes(project);

  if (options.discover) {
    printDiscoveredRoutes(routes, options.verbose);
    return;
  }

  const target = targetArgument
    ? targetArgument
    : targetType === "file"
      ? undefined
      : await promptForRoute(routes);

  if (!target) {
    throw new NextPackAiError("No target was provided.");
  }

  const normalizedTarget = targetType === "route" || (!targetType && target.startsWith("/"))
    ? normalizeRoute(target)
    : target;

  const result = await packRoute({
    cwd: process.cwd(),
    target: normalizedTarget,
    targetType,
    scope,
    focus,
    trace,
    format,
    include,
    exclude,
    maxDepth: options.maxDepth,
    maxFiles: options.maxFiles,
    maxChars: options.maxChars,
  });

  let savedPath: string | undefined;
  if (options.save) {
    savedPath = await writeOutput(options.save, result.output);
  }

  if (options.clipboard) {
    await clipboard.write(result.output);
  }

  if (options.stdout) {
    process.stdout.write(result.output);
  } else {
    printSummary({
      target: result.target,
      targetType: result.targetType,
      entryFile: path.relative(result.project.root, result.entryFile),
      fileCount: result.trace.includedFiles.length,
      skippedImportCount: result.trace.skippedImports.length,
      totalCharacters: result.trace.totalCharacters,
      copied: options.clipboard,
      savedPath,
      verbose: options.verbose,
      contextFileCount: result.contextFiles.length,
    });
  }

  if (!options.stdout && !options.save && !options.clipboard) {
    const safeName = result.targetType === "route"
      ? routeToSafeFileName(result.target)
      : routeToSafeFileName(path.relative(result.project.root, result.entryFile).replaceAll(path.sep, "/"));
    const defaultOutputPath = path.join(process.cwd(), ".nextpage", `${safeName}.md`);
    savedPath = await writeOutput(defaultOutputPath, result.output);
    console.log(`Saved bundle to ${savedPath}`);
  }
}

run().catch((error: unknown) => {
  if (error instanceof NextPackAiError) {
    console.error(`Error: ${error.message}`);
    if (error.details && error.details.length > 0) {
      for (const detail of error.details) {
        console.error(`- ${detail}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(`Unexpected error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.error("Unexpected unknown error.");
  process.exitCode = 1;
});
