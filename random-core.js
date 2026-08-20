(function initDisneyRandomCore(globalScope) {
  "use strict";

  const ENTITY_PATH = /\/browse\/entity-[0-9a-f-]+\/?$/i;
  const SERIES_BROWSE_PATH = /\/browse\/series\/?$/i;
  const MOVIES_BROWSE_PATH = /\/browse\/movies\/?$/i;
  const ORIGINALS_BROWSE_PATH = /\/browse\/originals\/?$/i;
  const PLAY_PATH = /\/play\/[0-9a-f-]+\/?$/i;

  function normalizeUrl(rawUrl, baseUrl) {
    if (!rawUrl) return null;

    try {
      const url = new URL(rawUrl, baseUrl);
      if (!/(^|\.)disneyplus\.com$/i.test(url.hostname)) return null;
      url.hash = "";
      url.search = "";
      return url.href.replace(/\/$/, "");
    } catch (_error) {
      return null;
    }
  }

  function isEntityUrl(url) {
    try {
      return ENTITY_PATH.test(new URL(url).pathname);
    } catch (_error) {
      return false;
    }
  }

  function isPlayUrl(url) {
    try {
      return PLAY_PATH.test(new URL(url).pathname);
    } catch (_error) {
      return false;
    }
  }

  function entityKey(url) {
    try {
      const match = new URL(url).pathname.match(/\/browse\/entity-([0-9a-f-]+)/i);
      return match?.[1]?.toLowerCase() || normalizeUrl(url, url);
    } catch (_error) {
      return null;
    }
  }

  function isSeriesBrowseUrl(url) {
    try {
      return SERIES_BROWSE_PATH.test(new URL(url).pathname);
    } catch (_error) {
      return false;
    }
  }

  function browseScope(url) {
    try {
      const path = new URL(url).pathname;
      if (SERIES_BROWSE_PATH.test(path)) return "series";
      if (MOVIES_BROWSE_PATH.test(path)) return "movies";
      if (ORIGINALS_BROWSE_PATH.test(path)) return "originals";
      return null;
    } catch (_error) {
      return null;
    }
  }

  function cleanLabel(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s*Für Details zu diesem Titel auswählen\.?\s*$/i, "")
      .replace(/\s*Zum Ansehen auswählen\..*$/i, "")
      .replace(/^Label:\s*(Neue Serie|Neue Folge|Neu)\s*/i, "")
      .trim()
      .slice(0, 240);
  }

  function classifyTitle({ url, label = "", pageIsSeriesBrowse = false }) {
    if (!isEntityUrl(url)) return null;
    if (pageIsSeriesBrowse) return "series";

    const text = cleanLabel(label);
    if (/\b(Staffel|Staffeln|Folge|Folgen|Serie|Series|Season|Seasons|Episode|Episodes)\b/i.test(text)) {
      return "series";
    }
    if (/\b(Film|Movie|Spielfilm)\b/i.test(text)) return "movie";
    return "unknown";
  }

  function resolveCatalogType({ previousType, previousScanId, currentScanId, contextType, inferredType }) {
    const knownPrevious = ["series", "movie", "special"].includes(previousType) ? previousType : null;
    if (currentScanId && previousScanId === currentScanId && knownPrevious) return knownPrevious;
    return contextType || knownPrevious || inferredType || "unknown";
  }

  function parseEpisodeSeriesTitle(label) {
    const text = cleanLabel(label);
    const spoken = text.match(/^(.+?)\s+(?:Staffel|Season)\s*\d+\s+(?:Folge|Episode)\s*\d+\b/i);
    if (spoken?.[1]) return cleanLabel(spoken[1]) || null;
    const withoutProgress = text
      .replace(/^Noch\s+\d+\s*(?:Min\.?|Minuten)\s*/i, "")
      .replace(/^\d+\s*(?:min(?:utes?)?)\s+(?:left|remaining)\s*/i, "");
    const compact = withoutProgress.match(/^(.+?)\s*S\d+\s*:\s*(?:F|E)\d+\b/i);
    return cleanLabel(compact?.[1]) || null;
  }

  function randomIndex(length, randomValue) {
    if (!Number.isInteger(length) || length <= 0) return -1;
    const value = Number.isFinite(randomValue) ? randomValue : Math.random();
    return Math.min(length - 1, Math.floor(Math.max(0, value) * length));
  }

  function pickRandom(items, randomValue) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items[randomIndex(items.length, randomValue)] || null;
  }

  function dedupeByUrl(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
      if (!item || !item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  function normalizeFilter(filter) {
    const allowedScopes = new Set(["all", "series", "movies", "originals"]);
    const scope = allowedScopes.has(filter?.scope) ? filter.scope : "all";
    const category = cleanLabel(filter?.category) || "all";
    const brand = cleanLabel(filter?.brand) || "all";
    const studio = cleanLabel(filter?.studio) || "all";
    return { scope, category: scope === "all" ? "all" : category, brand, studio };
  }

  function catalogContextForBrowse(scope, activeCategory, rowCategory) {
    if (!["series", "movies", "originals"].includes(scope)) return null;
    const category = cleanLabel(scope === "originals" ? rowCategory : activeCategory);
    const ignored = /^(Empfehlungen|Recommendations|Recommended)$/i.test(category);
    const all = /^(Alle Serien|All Series|All Shows|Alle Filme|All Movies)$/i.test(category);

    // A background tab may render the cards before Disney+ updates aria-selected.
    // Missing category metadata must not make us discard otherwise valid titles.
    if (category && ignored) return null;
    if (scope === "series") return { type: "series", category: category && !all ? category : null };
    if (scope === "movies") return { type: "movie", category: category && !all ? category : null };
    if (!category) return null;
    if (/^(Serien|Series)$/i.test(category)) return { type: "series", category };
    if (/^(Filme|Movies)$/i.test(category)) return { type: "movie", category };
    if (/^(Specials?)$/i.test(category)) return { type: "special", category };
    return { type: null, category };
  }

  function itemMatchesFilter(item, rawFilter) {
    if (!item?.url || item.excluded) return false;
    const filter = normalizeFilter(rawFilter);
    if (filter.scope === "series" && item.type !== "series") return false;
    if (filter.scope === "movies" && !["movie", "special"].includes(item.type)) return false;
    if (filter.scope === "originals" && !item.sources?.includes("originals")) return false;
    if (filter.brand !== "all" && !item.brands?.includes(filter.brand)) return false;
    if (filter.studio !== "all" && !item.studios?.includes(filter.studio)) return false;
    if (filter.category === "all") return true;
    return Array.isArray(item.categories?.[filter.scope]) && item.categories[filter.scope].includes(filter.category);
  }

  const api = {
    classifyTitle,
    browseScope,
    catalogContextForBrowse,
    cleanLabel,
    dedupeByUrl,
    entityKey,
    itemMatchesFilter,
    isEntityUrl,
    isPlayUrl,
    isSeriesBrowseUrl,
    normalizeUrl,
    normalizeFilter,
    parseEpisodeSeriesTitle,
    pickRandom,
    randomIndex,
    resolveCatalogType
  };

  globalScope.DisneyRandomCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
