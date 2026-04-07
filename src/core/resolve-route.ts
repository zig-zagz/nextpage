import type { DiscoveredRoute, RouteResolution } from "../types.js";
import { NextPackAiError } from "../errors.js";
import { normalizeRoute } from "../utils/path.js";

function formatSuggestionList(routes: DiscoveredRoute[]): string[] {
  return routes.slice(0, 10).map((item) => `${item.route} -> ${item.entryFile}`);
}

export function resolveRoute(route: string, discoveredRoutes: DiscoveredRoute[]): RouteResolution {
  const normalizedRoute = normalizeRoute(route);
  const matches = discoveredRoutes.filter((item) => item.route === normalizedRoute);

  if (matches.length === 1) {
    const match = matches[0]!;
    return {
      route: normalizedRoute,
      entryFile: match.entryFile,
      routeDir: match.routeDir,
    };
  }

  if (matches.length > 1) {
    throw new NextPackAiError(
      `Route ${normalizedRoute} is ambiguous.`,
      matches.map((item) => item.entryFile),
    );
  }

  const similar = discoveredRoutes.filter((item) => item.route.includes(normalizedRoute) || normalizedRoute.includes(item.route));
  const suggestions = similar.length > 0 ? similar : discoveredRoutes;

  throw new NextPackAiError(
    `Could not resolve route ${normalizedRoute}.`,
    formatSuggestionList(suggestions),
  );
}
