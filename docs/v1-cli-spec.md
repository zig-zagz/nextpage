# next-distil v1 CLI Spec

## Product Intent

`next-distil` distils a bounded area of a Next.js codebase into compact context that can be pasted into an LLM.

The tool is responsible for:

- selecting a narrow area of code
- tracing local dependencies according to user-defined limits
- formatting the result with low prompt noise

The tool is not responsible for:

- interpreting the code
- auditing design quality
- recommending refactors
- comparing pages semantically

## Product Model

The product has three layers:

- `selector`: chooses the starting area
- `tracer`: chooses how far to expand from that area
- `formatter`: chooses how compact the output should be

This should remain the core architecture. New features should slot into one of these layers rather than introducing an analysis layer.

## Primary Use Cases

- Distil a single App Router page and its immediate UI context.
- Distil a route while prioritizing `use client` components.
- Distil a single file and its local dependencies.
- Produce a smaller distilled context by limiting traversal depth, file count, or character count.
- Exclude known noise such as tests, stories, mocks, icons, or generated files.

## Non-Goals

- No AI-generated summaries inside the distilled context.
- No inferred design-system advice.
- No cross-page intelligence as a core requirement.
- No attempt to decide what the user is "really asking" beyond the provided flags and config.

## Command Surface

The CLI should expose three top-level commands:

- `distil <target>`
- `discover`
- `print-config`

### `distil <target>`

Distils a route or file into compact LLM-friendly context.

Examples:

```bash
next-distil distil /settings/profile
next-distil distil /settings/profile --focus client --trace local
next-distil distil app/settings/profile/page.tsx --target-type file --trace direct
```

### `discover`

Lists available route targets.

Examples:

```bash
next-distil discover
next-distil discover --verbose
```

### `print-config`

Prints the resolved config after merging defaults, config file values, and CLI flags.

Examples:

```bash
next-distil print-config
next-distil print-config --json
```

## `distil` Options

### Target Selection

- `--target-type <route|file>`
  - default: infer from input
  - route input begins with `/`
  - file input resolves from cwd

- `--scope <strict|context>`
  - `strict`: only the entry files plus traced dependencies
  - `context`: include route context files before tracing
  - default: `context`

- `--entry <page|layout|file>`
  - only applies when `target-type=route`
  - `page`: use the route page file
  - `layout`: use the nearest matching layout file
  - `file`: reserved for future route-local file targeting
  - default: `page`

### Focus

- `--focus <client|server|all>`
  - `client`: prioritize files with `use client` and client-adjacent UI files
  - `server`: deprioritize client components where possible
  - `all`: no client/server bias
  - default: `all`

`focus` is a prioritization and filtering control. It does not add interpretation.

### Tracing

- `--trace <direct|local|full>`
  - `direct`: include only direct imports from entry/context files
  - `local`: recurse, but strongly prefer route-local and nearby project files
  - `full`: recurse through all resolvable local imports
  - default: `full`

- `--max-depth <n>`
  - limits recursive traversal depth
  - ignored when `trace=direct`

- `--max-files <n>`
  - hard cap on included files

- `--max-chars <n>`
  - hard cap on total source characters

### Inclusion Controls

- `--include <csv>`
  - supported values in v1:
    - `layouts`
    - `route-files`
    - `styles`
    - `json`

- `--exclude <csv>`
  - supported values in v1:
    - `tests`
    - `stories`
    - `mocks`
    - `generated`
    - `icons`
    - `analytics`
    - `utils`

`include` adds categories to the candidate set. `exclude` removes categories after selection and before final formatting.

### Output

- `--format <compact|markdown|paths>`
  - `compact`: minimal header, short reasons, code blocks
  - `markdown`: current richer markdown format
  - `paths`: paths only, no file contents
  - default: `compact`

- `--stdout`
- `--save <path>`
- `--no-clipboard`
- `--verbose`

## Config File

The CLI should support a project-level config file:

- `.next-distilrc.json`

Example:

```json
{
  "scope": "context",
  "focus": "client",
  "trace": "local",
  "include": ["layouts", "route-files", "styles"],
  "exclude": ["tests", "stories", "mocks", "generated"],
  "maxFiles": 20,
  "maxChars": 30000,
  "format": "compact"
}
```

Resolution order:

1. internal defaults
2. config file
3. CLI flags

`print-config` should show the final resolved values.

## Distilled Context Semantics

The output should stay compact and deterministic.

### File Ordering

Files should be ordered as follows:

1. entry file
2. route context files
3. prioritized traced files
4. remaining traced files

Within each group, order should be stable and deterministic.

### Reasons

Reasons should stay short and mechanical:

- `route entry`
- `root layout`
- `ancestor layout`
- `route loading`
- `imported by app/settings/profile/page.tsx`
- `style imported by app/settings/profile/page.tsx`

Avoid long prose.

### Compact Format

`compact` should be the default and optimized for prompt use.

Example:

```md
# Distilled Context
Target: /settings/profile
Files: 6

## app/settings/profile/page.tsx
Reason: route entry
```tsx
...
```
```

The header should stay short. No narrative summary should be added.

## Route Context Rules

When `scope=context` and `target-type=route`, v1 should include:

- ancestor `layout.*` files up to app root
- route-local `loading.*`
- route-local `error.*`
- route-local `not-found.*`
- route-local `template.*`

When `include=styles`, v1 should also include route-local style files if present:

- `*.css`
- `*.module.css`
- `*.scss`
- `*.module.scss`

## Focus Rules

### `focus=client`

v1 behavior:

- prefer entry files that contain `use client`
- prefer traced files that contain `use client`
- include non-client files when they are directly required to preserve local code context
- do not try to infer runtime execution behavior beyond static imports

### `focus=server`

v1 behavior:

- do not actively seek `use client` leaves unless required by tracing rules

### `focus=all`

v1 behavior:

- current neutral behavior

## Trace Rules

### `trace=direct`

- include entry/context files
- include their direct local imports
- stop there

### `trace=local`

- recurse through local imports
- prioritize files in the same route directory, its subdirectories, and nearby sibling UI directories
- deprioritize known generic shared files when limits are reached

### `trace=full`

- recurse through all resolvable local imports inside project root

## Exclusion Rules

Exclusions should be implemented as path and filename heuristics in v1.

Examples:

- `tests`: `*.test.*`, `*.spec.*`, `__tests__/`
- `stories`: `*.stories.*`
- `mocks`: `__mocks__/`, `mock.*`, `mocks/`
- `generated`: generated folders and machine-written artifacts
- `icons`: icon packs and icon-only component directories
- `analytics`: telemetry wrappers and tracking modules
- `utils`: generic utility directories and helper-only files

These heuristics should be configurable later, but built-in defaults are acceptable for v1.

## Internal Architecture

The current codebase already has the correct skeleton. v1 should refactor toward the following modules.

### Keep

- `src/core/detect-project.ts`
- `src/core/discover-routes.ts`
- `src/core/resolve-route.ts`
- `src/core/resolve-import.ts`
- `src/core/parse-imports.ts`

### Add

- `src/core/select-target.ts`
  - resolves route or file input into entry files

- `src/core/load-config.ts`
  - loads and merges `.next-distilrc.json`

- `src/core/classify-file.ts`
  - classifies files for include/exclude rules

- `src/core/filter-candidates.ts`
  - applies inclusion and exclusion controls

- `src/core/prioritize-files.ts`
  - orders candidates according to focus and trace mode

- `src/core/trace-graph.ts`
  - evolves the current dependency tracer to support direct, local, and full modes

- `src/core/format-compact.ts`
  - optimized default output

### Evolve

- `src/core/collect-context-files.ts`
  - extend to support route-local styles

- `src/core/trace-dependencies.ts`
  - split traversal from prioritization and filtering

- `src/core/format-markdown-context.ts`
  - treat as the `markdown` formatter rather than the default formatter

- `src/cli.ts`
  - move from route-only flow to command-based flow

## Suggested Types

The internal types should move toward this shape:

```ts
type TargetType = "route" | "file";
type ScopeMode = "strict" | "context";
type FocusMode = "client" | "server" | "all";
type TraceMode = "direct" | "local" | "full";
type OutputFormat = "compact" | "markdown" | "paths";

interface DistilConfig {
  targetType?: TargetType;
  scope: ScopeMode;
  focus: FocusMode;
  trace: TraceMode;
  include: string[];
  exclude: string[];
  maxDepth?: number;
  maxFiles?: number;
  maxChars?: number;
  format: OutputFormat;
  stdout: boolean;
  save?: string;
  clipboard: boolean;
  verbose: boolean;
}
```

## MVP Build Order

### Phase 1

- add command-based CLI structure
- add config loading
- add `compact` formatter
- preserve current route behavior as default

### Phase 2

- add `focus`
- add `trace=direct|local|full`
- add `max-depth`

### Phase 3

- add `include=styles`
- add `exclude` heuristics
- add file target support

## Acceptance Criteria

v1 is successful if a user can:

- point at a route or file
- choose how much context they want
- bias toward `use client` code when needed
- control prompt size with hard limits
- exclude obvious noise
- receive compact, deterministic distilled context with minimal prose

## Summary

The shape of v1 should be:

- narrow purpose
- flexible scope controls
- deterministic traversal
- compact output

That keeps the product simple without making it rigid.
