import path from "node:path";

export function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

export function toPosixRelative(from: string, to: string): string {
  return normalizeSlashes(path.relative(from, to));
}

export function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (trimmed === "") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash === "/") {
    return "/";
  }

  return withLeadingSlash.replace(/\/+$/, "");
}

export function routeToSafeFileName(route: string): string {
  if (route === "/") {
    return "root";
  }

  return normalizeRoute(route)
    .slice(1)
    .replaceAll("/", "__")
    .replaceAll("[", "_")
    .replaceAll("]", "_");
}
