<p align="center">
  <img src="assets/next-distil.png" alt="next-distil logo" width="320" />
</p>

# next-distil

`next-distil` is a small TypeScript CLI for distilling a bounded area of a Next.js app into compact context that an LLM can read easily.

The point is not to interpret your code for you. The point is to give you a clean, narrow slice of code to paste into an LLM without dumping the whole repo.

## Why This Exists

UI work is usually page-driven.

You are normally trying to do one of these jobs:

- refactor a single route without dragging in the whole app
- isolate the client-side parts of a page
- give an LLM just enough surrounding context to change one screen safely
- reduce prompt noise by excluding tests, stories, mocks, icons, and generic helpers

In real projects, styles and component structure often drift page by page. When that happens, sending the whole codebase to an LLM is noisy and expensive. Sending only one page file is often too narrow. This tool sits in the middle:

- narrow enough to stay readable
- flexible enough to include the context you actually need

## What It Does

- detects the nearest Next.js project
- discovers App Router routes from `app/` or `src/app/`
- resolves a public route like `/settings/profile` to the correct `page.tsx`
- can also target a specific file directly
- includes route context such as ancestor layouts and route-local `loading.tsx`, `error.tsx`, `not-found.tsx`, and `template.tsx`
- traces local imports with configurable depth and scope
- can bias toward `use client` files
- can include styles and JSON
- can exclude noisy file categories
- outputs the result as `compact`, `markdown`, or `paths`
- copies the distilled context to the clipboard by default
- can also save the distilled context to disk or print it to stdout

## What It Does Not Do

- it does not explain the code
- it does not recommend refactors
- it does not do design audits
- it does not try to be an autonomous code-review agent

It is a scoping and distillation tool.

## Core Idea

The CLI has three jobs:

- `select`: choose the target
- `trace`: choose how far to expand from that target
- `format`: choose how compact the output should be

That is the whole product shape.

## Install

```bash
npm install
npm run build
```

## Use In Another Project

The CLI detects the Next.js app from the directory you run it in, so you normally run it from inside the app you want to inspect.

### Option 1: Use `npm link`

From this repo:

```bash
cd /path/to/next-distil
npm install
npm run build
npm link
```

Then from any Next.js app:

```bash
cd /path/to/your/nextjs-app
next-distil distil /dashboard
```

If you change the TypeScript source, rebuild before using the linked command again:

```bash
cd /path/to/next-distil
npm run build
```

### Option 2: Run the built CLI directly

```bash
cd /path/to/your/nextjs-app
node /path/to/next-distil/dist/cli.js distil /dashboard
```

### Option 3: Run the source directly during development

```bash
cd /path/to/your/nextjs-app
npx tsx /path/to/next-distil/src/cli.ts distil /dashboard
```

## Main Commands

### `distil <target>`

Distil one route or file into compact AI-friendly context.

Use this when you want to:

- work on one route
- work on one file
- keep prompt size under control
- bias the result toward client-side UI files

Examples:

```bash
next-distil distil /settings/profile
next-distil distil /settings/profile --focus client
next-distil distil app/settings/profile/page.tsx --target-type file
```

### `discover`

List discovered route targets.

Use this when you want to see what routes the tool can currently resolve.

Examples:

```bash
next-distil discover
next-distil discover --verbose
```

### `print-config`

Print the resolved CLI options.

Use this when you want to understand how the current flags are being interpreted.

Examples:

```bash
next-distil print-config
next-distil print-config --focus client --trace local --include styles
```

## Typical Workflow

### 1. Find a route

```bash
next-distil discover
```

### 2. Distil the route

```bash
next-distil distil /food/[id] --focus client --trace local --format compact
```

### 3. Save or print the result

```bash
next-distil distil /food/[id] --save ./.next-distil/food-id.md --stdout
```

## Output Formats

### `compact`

The default. Best for pasting into an LLM.

- short header
- short reasons
- embedded file contents

### `markdown`

A richer labeled distilled context document.

- more report-like
- still includes file contents

### `paths`

Only print the selected files and their reasons.

- useful for debugging scope
- useful when you want to inspect what would be included before generating the full distilled context

## Flags

### `--target-type <route|file>`

Choose whether the target is a public route or a file path.

Examples:

```bash
next-distil distil app/dashboard/page.tsx --target-type file
next-distil distil /dashboard --target-type route
```

### `--scope <strict|context>`

Controls whether route context files are included.

- `strict`: keep the distilled context tighter
- `context`: include layouts and route-local files like `loading.tsx` and `error.tsx`

Examples:

```bash
next-distil distil /dashboard --scope strict
next-distil distil /dashboard --scope context
```

`--mode` still works as a backward-compatible alias for `--scope`.

### `--focus <client|server|all>`

Controls whether the distilled context should bias toward client-side or server-side files.

- `client`: prefer `use client` modules
- `server`: deprioritize client modules where possible
- `all`: no bias

Examples:

```bash
next-distil distil /dashboard --focus client
next-distil distil /dashboard --focus server
```

### `--trace <direct|local|full>`

Controls how aggressively imports are followed.

- `direct`: include only direct imports
- `local`: recurse, but stay biased toward nearby page-local files
- `full`: recurse through all resolvable local imports

Examples:

```bash
next-distil distil /dashboard --trace direct
next-distil distil /dashboard --trace local
next-distil distil /dashboard --trace full
```

### `--include <csv>`

Explicitly include categories that are useful for the distilled context.

Supported values:

- `layouts`
- `route-files`
- `styles`
- `json`

Examples:

```bash
next-distil distil /dashboard --include styles
next-distil distil /dashboard --include layouts,styles,json
```

### `--exclude <csv>`

Remove noisy categories from the distilled context.

Supported values:

- `tests`
- `stories`
- `mocks`
- `generated`
- `icons`
- `analytics`
- `utils`

Examples:

```bash
next-distil distil /dashboard --exclude tests,stories,mocks
next-distil distil /dashboard --exclude icons,analytics,utils
```

### `--max-depth <n>`

Limit how many import levels the tracer can follow.

Examples:

```bash
next-distil distil /dashboard --trace local --max-depth 2
next-distil distil /dashboard --trace full --max-depth 3
```

### `--max-files <n>`

Hard cap on how many files can be included.

Examples:

```bash
next-distil distil /dashboard --max-files 15
```

### `--max-chars <n>`

Hard cap on total source characters included in the distilled context.

Examples:

```bash
next-distil distil /dashboard --max-chars 25000
```

### `--format <compact|markdown|paths>`

Choose the output format.

Examples:

```bash
next-distil distil /dashboard --format compact
next-distil distil /dashboard --format markdown
next-distil distil /dashboard --format paths
```

### `--stdout`

Print the distilled context to standard output.

Example:

```bash
next-distil distil /dashboard --stdout
```

### `--save <path>`

Save the distilled context to disk.

Example:

```bash
next-distil distil /dashboard --save ./.next-distil/dashboard.md
```

### `--no-clipboard`

Skip copying the distilled context to the clipboard.

Example:

```bash
next-distil distil /dashboard --no-clipboard
```

### `--verbose`

Show more detail in summaries and route discovery.

Example:

```bash
next-distil discover --verbose
```

## Example Use Cases

### Refactor one page safely

```bash
next-distil distil /settings/profile --focus client --trace local --exclude tests,stories,mocks
```

Use this when the job is local to one screen and you want the LLM to see the page plus nearby UI code.

### Inspect a file without resolving a route

```bash
next-distil distil app/food/[id]/page.tsx --target-type file --trace direct
```

Use this when you already know the exact file you want to distil.

### Check scope before generating the full distilled context

```bash
next-distil distil /dashboard --format paths --trace local --include styles
```

Use this when you want to sanity-check what the tool will include.

### Keep a prompt under control

```bash
next-distil distil /dashboard --focus client --max-files 12 --max-chars 20000 --format compact
```

Use this when context size matters more than completeness.

## Current Scope

This tool intentionally supports **Next.js App Router** projects.

Current limitations:

- no Pages Router support
- no monorepo package traversal
- no asset inlining
- no interpretation layer

## Development

Build:

```bash
npm run build
```

Typecheck:

```bash
npm run typecheck
```

Run locally in dev mode:

```bash
npx tsx src/cli.ts distil /dashboard
```
