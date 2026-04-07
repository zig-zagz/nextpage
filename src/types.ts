import ts from "typescript";

export type ScopeMode = "strict" | "context";
export type TargetType = "route" | "file";
export type FocusMode = "client" | "server" | "all";
export type TraceMode = "direct" | "local" | "full";
export type OutputFormat = "compact" | "markdown" | "paths";
export type IncludeCategory = "layouts" | "route-files" | "styles" | "json";
export type ExcludeCategory = "tests" | "stories" | "mocks" | "generated" | "icons" | "analytics" | "utils";

export interface AliasPattern {
  key: string;
  prefix: string;
  suffix: string;
  targets: string[];
}

export interface ProjectInfo {
  root: string;
  packageJsonPath: string;
  appDir: string;
  tsconfigPath?: string | undefined;
  compilerOptions: ts.CompilerOptions;
  aliasPatterns: AliasPattern[];
}

export interface DiscoveredRoute {
  route: string;
  entryFile: string;
  routeDir: string;
  rawSegments: string[];
  publicSegments: string[];
}

export interface RouteResolution {
  route: string;
  entryFile: string;
  routeDir: string;
}

export interface FileResolution {
  entryFile: string;
  routeDir?: string | undefined;
}

export interface SelectedTarget {
  targetType: TargetType;
  target: string;
  entryFile: string;
  route?: string | undefined;
  routeDir?: string | undefined;
}

export interface ContextFile {
  path: string;
  reason: string;
}

export interface SkippedImport {
  from: string;
  specifier: string;
  reason: string;
}

export interface IncludedFile {
  path: string;
  relativePath: string;
  reason: string;
  content: string;
  isClient: boolean;
  depth: number;
  category: "code" | "style" | "json" | "other";
}

export interface TraceResult {
  includedFiles: IncludedFile[];
  skippedImports: SkippedImport[];
  totalCharacters: number;
  truncated: boolean;
  truncationReasons: string[];
}

export interface PackOptions {
  cwd: string;
  target: string;
  targetType?: TargetType | undefined;
  scope: ScopeMode;
  focus: FocusMode;
  trace: TraceMode;
  format: OutputFormat;
  include: IncludeCategory[];
  exclude: ExcludeCategory[];
  maxDepth?: number | undefined;
  maxFiles?: number | undefined;
  maxChars?: number | undefined;
}

export interface PackResult {
  project: ProjectInfo;
  target: string;
  targetType: TargetType;
  entryFile: string;
  contextFiles: ContextFile[];
  trace: TraceResult;
  format: OutputFormat;
  output: string;
}
