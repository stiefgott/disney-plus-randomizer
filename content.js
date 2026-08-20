(function initDisneyRandom() {
  "use strict";

  if (window.__DISNEY_RANDOM_ACTIVE__) return;
  window.__DISNEY_RANDOM_ACTIVE__ = true;

  const Core = globalThis.DisneyRandomCore;
  const I18n = globalThis.DisneyRandomI18n;
  const CATALOG_KEY = "dpRandom.catalog.v1";
  const ACTIVE_SERIES_KEY = "dpRandom.activeSeries.v1";
  const AUTO_SCAN_KEY = "dpRandom.autoScan.v1";
  const BLOCKLIST_KEY = "dpRandom.blocklist.v1";
  const EPISODE_LIBRARY_KEY = "dpRandom.episodeLibrary.v1";
  const EPISODE_SERIES_MAP_KEY = "dpRandom.episodeSeriesMap.v1";
  const FACETS_KEY = "dpRandom.facets.v1";
  const FILTER_KEY = "dpRandom.filter.v1";
  const HISTORY_KEY = "dpRandom.history.v1";
  const PENDING_KEY = "dpRandom.pending.v1";
  const PLAYBACK_SOURCE_KEY = "dpRandom.playbackSource.v1";
  const PLAYLISTS_KEY = "dpRandom.playlists.v1";
  const SETTINGS_KEY = "dpRandom.settings.v1";
  const PLAYER_STATE_EVENT = "dp-random:shuffle-state";
  const PLAYER_TOGGLE_REQUEST_EVENT = "dp-random:toggle-request";
  // The German Disney+ catalog already contains well over 1,800 entries. Keep
  // enough headroom so movies discovered later do not replace series collected
  // earlier in the local catalog.
  const MAX_CATALOG_SIZE = 5000;
  const MAX_HISTORY_SIZE = 30;
  const DEFAULT_SETTINGS = {
    autoplay: true,
    shufflePlayback: false,
    skipWatchedEpisodes: false
  };
  const DEFAULT_FILTER = { scope: "all", category: "all", brand: "all", studio: "all" };
  const DEFAULT_PLAYBACK_SOURCE = { kind: "current", playlistId: null };

  const state = {
    activeSeries: null,
    autoScanSeen: new Set(),
    autoScanId: null,
    autoScanRoute: null,
    blocklist: new Set(),
    boundVideos: new WeakSet(),
    catalog: new Map(),
    episodeLibrary: new Map(),
    episodeSeriesMap: new Map(),
    facets: { series: [], movies: [], originals: [], brands: [], studios: [] },
    filter: { ...DEFAULT_FILTER },
    history: [],
    panelOpen: false,
    playbackSource: { ...DEFAULT_PLAYBACK_SOURCE },
    playlists: [],
    saveTimer: null,
    scanTimer: null,
    settings: { ...DEFAULT_SETTINGS },
    shuffleTransitioning: false,
    toastTimer: null
  };

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  function storageRemove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }

  function runtimeSend(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(response || null);
    }));
  }

  function cryptoRandom() {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 0x100000000;
  }

  function pickRandom(items) {
    return Core.pickRandom(items, cryptoRandom());
  }

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function pageIsSeriesBrowse() {
    if (Core.isSeriesBrowseUrl(location.href)) return true;
    const heading = document.querySelector("main h1");
    return /^(Serien|Series|TV Shows)$/i.test(heading?.textContent?.trim() || "");
  }

  function pageIsSeriesDetail() {
    if (!Core.isEntityUrl(location.href)) return false;
    return Array.from(document.querySelectorAll('[role="tab"], main p, main [aria-label]')).some((element) =>
      /^(FOLGEN|EPISODES)$/i.test(element.textContent?.trim() || "") ||
      /\b\d+\s+(Staffel|Staffeln|Season|Seasons)\b/i.test(element.textContent || "")
    );
  }

  function pageIsPlayer() {
    return Core.isPlayUrl(location.href);
  }

  function bestLabel(link) {
    const imageAlt = Array.from(link.querySelectorAll("img[alt]"))
      .map((image) => image.getAttribute("alt")?.trim())
      .find((text) => text && !/^\d+$/.test(text) && !/^(Disney\+|Hulu|Marvel|Pixar|Star Wars)$/i.test(text));
    return Core.cleanLabel(imageAlt || link.getAttribute("aria-label") || link.title || link.textContent);
  }

  function uniqueLabels(values) {
    return [...new Set((values || []).map(Core.cleanLabel).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "de"));
  }

  function normalizeCatalogItem(item) {
    const brands = uniqueLabels(item?.brands);
    const studios = uniqueLabels(item?.studios);
    const sources = uniqueLabels(item?.sources);
    if (!sources.length && item?.type === "series") sources.push("series");
    if (!sources.length && item?.type === "movie") sources.push("movies");
    const categories = {};
    for (const scope of ["series", "movies", "originals"]) {
      categories[scope] = uniqueLabels(item?.categories?.[scope]);
    }
    return {
      ...item,
      brands,
      categories,
      excluded: Boolean(item?.excluded),
      sources: uniqueLabels(sources),
      studios
    };
  }

  function normalizeFacets(value) {
    return {
      series: uniqueLabels(value?.series),
      movies: uniqueLabels(value?.movies),
      originals: uniqueLabels(value?.originals),
      brands: uniqueLabels(value?.brands),
      studios: uniqueLabels(value?.studios)
    };
  }

  function normalizePlaylists(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.flatMap((playlist) => {
      const id = String(playlist?.id || "").trim().slice(0, 80);
      const name = Core.cleanLabel(playlist?.name).slice(0, 48);
      if (!id || !name || seen.has(id)) return [];
      seen.add(id);
      const seriesUrls = Core.dedupeByUrl((playlist?.seriesUrls || []).map((url) => ({
        url: Core.normalizeUrl(url, location.href)
      })).filter((item) => item.url)).map((item) => item.url);
      return [{
        id,
        name,
        seriesUrls,
        createdAt: Number(playlist?.createdAt) || Date.now(),
        updatedAt: Number(playlist?.updatedAt) || Date.now()
      }];
    });
  }

  function normalizePlaybackSource(value) {
    const kind = ["current", "filter", "playlist"].includes(value?.kind) ? value.kind : "current";
    const playlistId = kind === "playlist" ? String(value?.playlistId || "") || null : null;
    return playlistId || kind !== "playlist" ? { kind, playlistId } : { ...DEFAULT_PLAYBACK_SOURCE };
  }

  function ignoredCategory(label) {
    return /^(Empfehlungen|Recommendations|Recommended)$/i.test(Core.cleanLabel(label));
  }

  function allCategory(label) {
    return /^(Alle Serien|All Series|All Shows|Alle Filme|All Movies)$/i.test(Core.cleanLabel(label));
  }

  function activeBrowseCategory() {
    const tab = document.querySelector('main [role="tab"][aria-selected="true"]');
    return Core.cleanLabel(tab?.textContent);
  }

  function tabLabel(tab) {
    return Core.cleanLabel(tab?.textContent || tab?.getAttribute("aria-label") || tab?.querySelector("img[alt]")?.getAttribute("alt"));
  }

  function primaryBrandTablist() {
    return Array.from(document.querySelectorAll('[role="tablist"]')).find((list) => {
      const labels = Array.from(list.querySelectorAll('[role="tab"]')).map(tabLabel);
      return labels.includes("Disney+") && labels.includes("Hulu");
    }) || null;
  }

  function activeHomeBrand() {
    const selected = primaryBrandTablist()?.querySelector('[role="tab"][aria-selected="true"]');
    const label = tabLabel(selected);
    return /^(Disney\+|Hulu)$/i.test(label) ? label : null;
  }

  function studioTablist() {
    const studioNames = new Set(["Hulu Originals", "Disney", "Pixar", "Marvel", "Star Wars", "National Geographic", "ESPN", "FX"]);
    return Array.from(document.querySelectorAll('main [role="tablist"]')).find((list) => {
      const labels = Array.from(list.querySelectorAll('[role="tab"]')).map(tabLabel);
      return labels.filter((label) => studioNames.has(label)).length >= 3;
    }) || null;
  }

  function activeStudio() {
    return tabLabel(studioTablist()?.querySelector('[role="tab"][aria-selected="true"]')) || null;
  }

  function discoverStudioRoutes() {
    const excluded = new Set(["series", "movies", "originals", "disneyplus", "hulu", "live", "watchlist", "search"]);
    const routes = [];
    const seen = new Set();
    for (const link of document.querySelectorAll('main a[href*="/browse/"]')) {
      const url = Core.normalizeUrl(link.getAttribute("href"), location.href);
      if (!url) continue;
      const match = new URL(url).pathname.match(/\/browse\/([a-z0-9-]+)\/?$/i);
      const slug = match?.[1]?.toLocaleLowerCase("en");
      if (!slug || slug.startsWith("entity-") || excluded.has(slug)) continue;
      const studio = Core.cleanLabel(
        link.getAttribute("aria-label") || link.textContent || link.querySelector("img[alt]")?.getAttribute("alt")
      );
      if (!studio || seen.has(slug)) continue;
      seen.add(slug);
      routes.push({ path: `browse/${slug}`, label: studio, studio, brand: "Disney+" });
    }
    return routes;
  }

  function currentStudioPage() {
    if (state.autoScanRoute?.studio) return state.autoScanRoute.studio;
    const match = location.pathname.match(/\/browse\/([a-z0-9-]+)\/?$/i);
    const slug = match?.[1]?.toLocaleLowerCase("en");
    if (!slug || ["series", "movies", "originals", "disneyplus", "hulu", "live", "watchlist", "search"].includes(slug)) return null;
    return Array.from(document.querySelectorAll("main img[alt]"))
      .map((image) => Core.cleanLabel(image.getAttribute("alt")))
      .find((label) => label && label.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === slug) || null;
  }

  function originalRowCategory(link) {
    const set = link.closest('[data-testid="set"]');
    return Core.cleanLabel(set?.querySelector("h2, h3, h4, h5")?.textContent);
  }

  function isContinueWatchingLink(link) {
    return /^(Weiterschauen|Continue Watching)$/i.test(originalRowCategory(link));
  }

  function discoverFacets(scope) {
    if (!scope) return false;
    const labels = scope === "originals"
      ? Array.from(document.querySelectorAll('main [data-testid="set"] h2, main [data-testid="set"] h3, main [data-testid="set"] h4, main [data-testid="set"] h5')).map((heading) => heading.textContent)
      : Array.from(document.querySelectorAll('main [role="tab"]')).map((tab) => tab.textContent);
    const discovered = uniqueLabels(labels).filter((label) => !ignoredCategory(label) && !allCategory(label));
    const next = uniqueLabels([...(state.facets[scope] || []), ...discovered]);
    if (next.join("|") === (state.facets[scope] || []).join("|")) return false;
    state.facets = { ...state.facets, [scope]: next };
    return true;
  }

  function discoverBrandFacets(brand) {
    const brands = brand ? [brand] : [];
    const legacyStudios = Array.from(studioTablist()?.querySelectorAll('[role="tab"]') || [])
      .map(tabLabel)
      .filter((label) => label && label !== "Hulu Originals");
    const studios = [...legacyStudios, ...discoverStudioRoutes().map((route) => route.studio)];
    const nextBrands = uniqueLabels([...(state.facets.brands || []), ...brands]);
    const nextStudios = uniqueLabels([...(state.facets.studios || []), ...studios]);
    const brandChanged = nextBrands.join("|") !== (state.facets.brands || []).join("|");
    const studioChanged = nextStudios.join("|") !== (state.facets.studios || []).join("|");
    if (brandChanged || studioChanged) {
      state.facets = { ...state.facets, brands: nextBrands, studios: nextStudios };
    }
    return brandChanged || studioChanged;
  }

  function bestImageUrl(link) {
    const image = link.querySelector("img");
    const source = image?.currentSrc || image?.src || image?.getAttribute("src");
    return /^https:\/\//i.test(source || "") ? source : null;
  }

  function isLikelyRatingBadgeImage(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const height = Number(parsed.searchParams.get("height"));
      const width = Number(parsed.searchParams.get("width"));
      return height > 0 && height <= 128 && width === 0;
    } catch (_error) {
      return false;
    }
  }

  function repairContinueWatchingCatalog() {
    let changed = false;
    for (const mapping of state.episodeSeriesMap.values()) {
      const seriesUrl = Core.normalizeUrl(mapping?.seriesUrl, location.href);
      const title = Core.cleanLabel(mapping?.title);
      const previous = seriesUrl ? state.catalog.get(seriesUrl) : null;
      if (!previous || !title) continue;
      const repaired = normalizeCatalogItem({
        ...previous,
        imageUrl: isLikelyRatingBadgeImage(previous.imageUrl) ? null : previous.imageUrl,
        title,
        type: "series"
      });
      if (itemSignature(previous) === itemSignature(repaired)) continue;
      state.catalog.set(seriesUrl, repaired);
      changed = true;
    }
    return changed;
  }

  function itemSignature(item) {
    return JSON.stringify({
      availabilityScanId: item.availabilityScanId,
      brands: item.brands,
      categories: item.categories,
      excluded: item.excluded,
      imageUrl: item.imageUrl,
      sources: item.sources,
      studios: item.studios,
      title: item.title,
      type: item.type
    });
  }

  function upsertCatalogLink(link, context, now) {
    const url = Core.normalizeUrl(link.getAttribute("href"), location.href);
    if (!url || !Core.isEntityUrl(url) || state.blocklist.has(url)) return false;

    if (state.autoScanId) {
      const scanContext = [
        state.autoScanId,
        url,
        context.source || "",
        context.type || "",
        context.categoryScope || "",
        context.category || "",
        context.brand || "",
        context.studio || ""
      ].join("|");
      if (state.autoScanSeen.has(scanContext)) return false;
      state.autoScanSeen.add(scanContext);
    }

    const label = Core.cleanLabel(context.title) || bestLabel(link);
    const rawLabel = `${link.getAttribute("aria-label") || ""} ${link.textContent || ""}`;
    const previous = normalizeCatalogItem(state.catalog.get(url) || {});
    const categories = { ...previous.categories };
    const brands = new Set(previous.brands);
    const sources = new Set(previous.sources);
    const studios = new Set(previous.studios);
    if (context.source) sources.add(context.source);
    if (context.brand) brands.add(context.brand);
    if (context.studio) studios.add(context.studio);
    if (/Hulu\s+Original/i.test(rawLabel)) brands.add("Hulu");
    if (/Disney\+\s+Original/i.test(rawLabel)) brands.add("Disney+");
    if (context.category && context.categoryScope) {
      categories[context.categoryScope] = uniqueLabels([
        ...(categories[context.categoryScope] || []),
        context.category
      ]);
    }

    const inferredType = Core.classifyTitle({
      url,
      label: rawLabel,
      pageIsSeriesBrowse: context.source === "series"
    });

    const discoveredImageUrl = context.source === "continue" ? null : bestImageUrl(link);
    const previousImageUrl = context.source === "continue" && isLikelyRatingBadgeImage(previous.imageUrl)
      ? null
      : previous.imageUrl;
    const next = normalizeCatalogItem({
      ...previous,
      url,
      title: label || previous.title || "Disney+-Titel",
      type: Core.resolveCatalogType({
        previousType: previous.type,
        previousScanId: previous.availabilityScanId,
        currentScanId: state.autoScanId,
        contextType: context.type,
        inferredType
      }),
      availabilityScanId: state.autoScanId || previous.availabilityScanId || null,
      imageUrl: discoveredImageUrl || previousImageUrl || null,
      brands: [...brands],
      sources: [...sources],
      studios: [...studios],
      categories,
      lastSeen: now
    });
    const changed = !state.catalog.has(url) || itemSignature(previous) !== itemSignature(next);
    state.catalog.set(url, next);
    return changed;
  }

  function rememberContinueWatchingMappings(now) {
    const orderedLinks = Array.from(document.querySelectorAll(
      'main a[href*="/play/"], main a[href*="/browse/entity-"]'
    ));
    let catalogChanged = false;
    let mappingChanged = false;

    for (let index = 0; index < orderedLinks.length; index += 1) {
      const playLink = orderedLinks[index];
      const episodeUrl = Core.normalizeUrl(playLink.getAttribute("href"), location.href);
      if (!episodeUrl || !Core.isPlayUrl(episodeUrl)) continue;
      const playLabel = Core.cleanLabel(playLink.getAttribute("aria-label") || playLink.textContent);
      const seriesTitle = Core.parseEpisodeSeriesTitle(playLabel);
      if (!seriesTitle) continue;

      let seriesLink = null;
      for (let offset = 1; offset <= 3; offset += 1) {
        const candidate = orderedLinks[index + offset];
        if (!candidate || candidate.getAttribute("href")?.includes("/play/")) break;
        const candidateLabel = Core.cleanLabel(candidate.getAttribute("aria-label") || candidate.textContent);
        if (candidateLabel.toLocaleLowerCase("de").includes(seriesTitle.toLocaleLowerCase("de"))) {
          seriesLink = candidate;
          break;
        }
      }
      if (!seriesLink) continue;

      const seriesUrl = Core.normalizeUrl(seriesLink.getAttribute("href"), location.href);
      if (!seriesUrl || !Core.isEntityUrl(seriesUrl)) continue;
      const previous = state.episodeSeriesMap.get(episodeUrl);
      const mapping = { episodeUrl, seriesUrl, title: seriesTitle, updatedAt: now };
      state.episodeSeriesMap.set(episodeUrl, mapping);
      if (!previous || previous.seriesUrl !== seriesUrl || previous.title !== seriesTitle) mappingChanged = true;
      if (upsertCatalogLink(seriesLink, {
        source: "continue",
        title: seriesTitle,
        type: "series"
      }, now)) catalogChanged = true;
    }

    if (mappingChanged) {
      storageSet({ [EPISODE_SERIES_MAP_KEY]: [...state.episodeSeriesMap.values()] });
    }
    return catalogChanged;
  }

  function scanDocument(scanContext = {}) {
    const browseScope = Core.browseScope(location.href);
    const homeBrand = activeHomeBrand();
    const activeCategory = Core.cleanLabel(scanContext.category) || activeBrowseCategory();
    const selectedStudio = activeStudio();
    const studioPage = currentStudioPage();
    const now = Date.now();
    let changed = discoverFacets(browseScope);
    if (discoverBrandFacets(homeBrand)) changed = true;

    if (browseScope) {
      for (const link of document.querySelectorAll('main a[href*="/browse/entity-"]')) {
        const context = Core.catalogContextForBrowse(browseScope, activeCategory, originalRowCategory(link));
        if (!context) continue;

        if (upsertCatalogLink(link, {
          category: context.category,
          categoryScope: browseScope,
          source: browseScope,
          type: context.type,
        }, now)) changed = true;
      }
    }

    if (homeBrand) {
      for (const link of document.querySelectorAll('main a[href*="/browse/entity-"]')) {
        // Continue Watching cards describe the current episode and often contain
        // only an age-rating image. They are normalized separately below.
        if (isContinueWatchingLink(link)) continue;
        if (upsertCatalogLink(link, { brand: homeBrand, source: "home" }, now)) changed = true;
      }
    }

    if (studioPage) {
      for (const link of document.querySelectorAll('main a[href*="/browse/entity-"]')) {
        if (upsertCatalogLink(link, {
          brand: "Disney+",
          source: "studio",
          studio: studioPage
        }, now)) changed = true;
      }
    }

    const studioList = studioTablist();
    if (selectedStudio && studioList) {
      const panel = Array.from(document.querySelectorAll('main [role="tabpanel"]')).find((candidate) =>
        Core.cleanLabel(candidate.getAttribute("aria-label")) === selectedStudio
      );
      if (panel) {
        const studioBrand = selectedStudio === "Hulu Originals" ? "Hulu" : "Disney+";
        for (const link of panel.querySelectorAll('a[href*="/browse/entity-"]')) {
          if (upsertCatalogLink(link, {
            brand: studioBrand,
            source: "studio",
            studio: selectedStudio === "Hulu Originals" ? null : selectedStudio
          }, now)) changed = true;
        }
      }
    }

    if (/\/home\/?$/i.test(location.pathname) && rememberContinueWatchingMappings(now)) changed = true;

    if (pageIsSeriesDetail() && Core.isEntityUrl(location.href)) {
      const url = Core.normalizeUrl(location.href, location.href);
      const title = Core.cleanLabel(document.title.replace(/\s*\|\s*Disney\+.*$/i, ""));
      if (!state.blocklist.has(url)) {
        const previous = normalizeCatalogItem(state.catalog.get(url) || {});
        const next = normalizeCatalogItem({
          ...previous,
          url,
          title: title || previous.title || "Disney+-Serie",
          type: "series",
          sources: [...previous.sources, "series"],
          lastSeen: now
        });
        state.catalog.set(url, next);
        if (!previous.url || itemSignature(previous) !== itemSignature(next)) changed = true;
      }
    }

    if (state.catalog.size > MAX_CATALOG_SIZE) {
      const oldest = [...state.catalog.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, MAX_CATALOG_SIZE);
      state.catalog = new Map(oldest.map((item) => [item.url, item]));
      changed = true;
    }

    if (changed && !state.autoScanId) scheduleCatalogSave();
    if (!state.autoScanId) {
      rememberEpisodeLibrary();
      ensureInlineRandomButton();
      bindPlayerVideos();
      updateUi();
    }
  }

  function scheduleScan() {
    if (pageIsPlayer() || state.autoScanId) return;
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(scanDocument, 420);
  }

  function scheduleCatalogSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      if (state.autoScanId) return;
      storageSet({
        [CATALOG_KEY]: [...state.catalog.values()],
        [FACETS_KEY]: state.facets
      });
    }, 700);
  }

  function candidatesFor(mode) {
    const currentUrl = Core.normalizeUrl(location.href, location.href);
    const recent = new Set(state.history.slice(0, 12));
    let candidates = [...state.catalog.values()]
      .map(normalizeCatalogItem)
      .filter((item) => item.url !== currentUrl && !item.excluded && !state.blocklist.has(item.url));

    if (mode === "series") {
      const filter = state.filter.scope === "series"
        ? state.filter
        : { scope: "series", category: "all", brand: state.filter.brand, studio: state.filter.studio };
      candidates = candidates.filter((item) => Core.itemMatchesFilter(item, filter));
    } else if (mode === "movie") {
      const filter = state.filter.scope === "movies"
        ? state.filter
        : { scope: "movies", category: "all", brand: state.filter.brand, studio: state.filter.studio };
      candidates = candidates.filter((item) => Core.itemMatchesFilter(item, filter));
    } else {
      candidates = candidates.filter((item) => Core.itemMatchesFilter(item, state.filter));
    }

    const notRecent = candidates.filter((item) => !recent.has(item.url));
    return Core.dedupeByUrl(notRecent.length ? notRecent : candidates);
  }

  function availableSeries() {
    return [...state.catalog.values()]
      .map(normalizeCatalogItem)
      .filter((item) => item.type === "series" && !item.excluded && !state.blocklist.has(item.url));
  }

  function seriesCandidatesForSource() {
    const series = availableSeries();
    if (state.playbackSource.kind === "playlist") {
      const playlist = state.playlists.find((item) => item.id === state.playbackSource.playlistId);
      if (!playlist) return [];
      const allowed = new Set(playlist.seriesUrls.map(Core.entityKey).filter(Boolean));
      return series.filter((item) => allowed.has(Core.entityKey(item.url)));
    }
    if (state.playbackSource.kind === "filter") {
      return series.filter((item) => Core.itemMatchesFilter(item, state.filter));
    }
    return [];
  }

  function playbackSourceLabel() {
    if (state.playbackSource.kind === "playlist") {
      const playlist = state.playlists.find((item) => item.id === state.playbackSource.playlistId);
      return I18n.t(playlist ? `Playlist „${playlist.name}“` : "Playlist");
    }
    if (state.playbackSource.kind === "filter") return I18n.t("aktiver Filter");
    return I18n.t("aktuelle Serie");
  }

  async function refreshPlaybackCollections() {
    const stored = await storageGet([PLAYBACK_SOURCE_KEY, PLAYLISTS_KEY, FILTER_KEY]);
    state.playbackSource = normalizePlaybackSource(stored[PLAYBACK_SOURCE_KEY]);
    state.playlists = normalizePlaylists(stored[PLAYLISTS_KEY]);
    state.filter = Core.normalizeFilter(stored[FILTER_KEY] || state.filter || DEFAULT_FILTER);
  }

  async function recordHistory(url) {
    state.history = [url, ...state.history.filter((item) => item !== url)].slice(0, MAX_HISTORY_SIZE);
    await storageSet({ [HISTORY_KEY]: state.history });
  }

  function currentLocalePrefix() {
    const match = location.pathname.match(/^\/([a-z]{2}-[a-z]{2})(?:\/|$)/i);
    return match ? `/${match[1]}` : "";
  }

  function seriesBrowseUrl() {
    const nav = Array.from(document.querySelectorAll("a[href]")).find((link) =>
      /^(Serien|Series|TV Shows)$/i.test(link.textContent?.trim() || "")
    );
    return Core.normalizeUrl(nav?.href || `${location.origin}${currentLocalePrefix()}/browse/series`, location.href);
  }

  function moviesBrowseUrl() {
    const nav = Array.from(document.querySelectorAll("a[href]")).find((link) =>
      /^(Filme|Movies)$/i.test(link.textContent?.trim() || "")
    );
    return Core.normalizeUrl(nav?.href || `${location.origin}${currentLocalePrefix()}/browse/movies`, location.href);
  }

  function originalsBrowseUrl() {
    const nav = Array.from(document.querySelectorAll("a[href]")).find((link) =>
      /^(Originals)$/i.test(link.textContent?.trim() || "")
    );
    return Core.normalizeUrl(nav?.href || `${location.origin}${currentLocalePrefix()}/browse/originals`, location.href);
  }

  function homeUrl() {
    const nav = Array.from(document.querySelectorAll("a[href]")).find((link) =>
      /^(Startseite|Home)$/i.test(link.textContent?.trim() || "")
    );
    return Core.normalizeUrl(nav?.href || `${location.origin}${currentLocalePrefix()}/home`, location.href);
  }

  function brandBrowseUrl(brand) {
    const slug = brand === "Hulu" ? "hulu" : "disneyplus";
    return Core.normalizeUrl(`${location.origin}${currentLocalePrefix()}/browse/${slug}`, location.href);
  }

  async function beginDiscovery(mode) {
    const pending = { kind: "discover", mode, createdAt: Date.now() };
    await storageSet({ [PENDING_KEY]: pending });
    const target = state.filter.brand !== "all"
      ? brandBrowseUrl(state.filter.brand)
      : mode === "series" || state.filter.scope === "series"
      ? seriesBrowseUrl()
      : mode === "movie" || state.filter.scope === "movies"
        ? moviesBrowseUrl()
        : state.filter.scope === "originals"
          ? originalsBrowseUrl()
          : homeUrl();
    showToast("Ich öffne die passende Disney+-Übersicht …");
    location.assign(target);
  }

  async function openRandomTitle(mode, options = {}) {
    scanDocument();
    const candidates = Array.isArray(options.candidates) ? options.candidates : candidatesFor(mode);
    if (!candidates.length) {
      const filtered = state.filter.scope !== "all" || state.filter.category !== "all" || state.filter.brand !== "all" || state.filter.studio !== "all";
      if (filtered) {
        showToast("Für diesen Filter sind keine aktivierten Titel vorhanden. Prüfe deinen Katalog.");
        return;
      }
      await beginDiscovery(mode);
      return;
    }

    const selected = pickRandom(candidates);
    await recordHistory(selected.url);

    const shouldAutoplay = options.autoplay ?? (mode === "series" && state.settings.autoplay);
    if (shouldAutoplay) {
      await storageSet({
        [PENDING_KEY]: {
          kind: "autoplay",
          targetUrl: selected.url,
          title: selected.title,
          createdAt: Date.now()
        }
      });
    }

    showToast(`Zufall: ${selected.title || "Disney+-Titel"}`);
    setTimeout(() => location.assign(selected.url), 140);
  }

  async function openRandomSeriesFromPlaybackSource(options = {}) {
    await refreshPlaybackCollections();
    let candidates = seriesCandidatesForSource();
    const currentSeriesUrl = options.currentSeriesUrl || state.activeSeries?.seriesUrl;
    const alternatives = candidates.filter((item) => item.url !== currentSeriesUrl);
    if (alternatives.length) candidates = alternatives;
    if (!candidates.length) {
      showToast(state.playbackSource.kind === "playlist"
        ? "Diese Playlist enthält noch keine verfügbaren Serien."
        : "Unter diesem Filter wurden noch keine Serien erkannt. Bitte den Katalog erneut abgleichen."
      );
      return false;
    }

    const selected = pickRandom(candidates);
    await recordHistory(selected.url);
    await storageSet({
      [PENDING_KEY]: {
        kind: "source-play",
        seriesUrl: selected.url,
        previousEpisodeUrl: options.previousEpisodeUrl || null,
        sourceKind: state.playbackSource.kind,
        playlistId: state.playbackSource.playlistId,
        createdAt: Date.now()
      }
    });
    showToast(`${playbackSourceLabel()}: ${selected.title}`);
    setTimeout(() => location.assign(selected.url), 140);
    return true;
  }

  async function startFilterPlayback() {
    await refreshPlaybackCollections();
    const matches = candidatesFor("title");
    const series = matches.filter((item) => item.type === "series");
    const movies = matches.filter((item) => item.type === "movie" || item.type === "special");
    const playSingleTitle = state.filter.scope === "movies" || (!series.length && movies.length > 0);
    if (playSingleTitle) {
      state.playbackSource = { ...DEFAULT_PLAYBACK_SOURCE };
      await storageSet({ [PLAYBACK_SOURCE_KEY]: state.playbackSource });
      if (state.settings.shufflePlayback) await setSetting("shufflePlayback", false);
      return openRandomTitle("title", { autoplay: true, candidates: movies });
    }
    state.playbackSource = { kind: "filter", playlistId: null };
    await storageSet({ [PLAYBACK_SOURCE_KEY]: state.playbackSource });
    await setShufflePlayback(true);
    return openRandomSeriesFromPlaybackSource();
  }

  async function startActiveSourcePlayback() {
    await refreshPlaybackCollections();
    if (state.playbackSource.kind === "current") {
      state.playbackSource = { kind: "filter", playlistId: null };
      await storageSet({ [PLAYBACK_SOURCE_KEY]: state.playbackSource });
    }
    await setShufflePlayback(true);
    return openRandomSeriesFromPlaybackSource();
  }

  function episodeLinks() {
    const links = Array.from(document.querySelectorAll('a[href*="/play/"]'));
    const episodes = links.filter((link) => {
      const label = `${link.getAttribute("aria-label") || ""} ${link.textContent || ""}`;
      const insideEpisodePanel = Boolean(link.closest('[role="tabpanel"]'));
      return insideEpisodePanel && /\b(Staffel|Season)\s*\d+\s*(Folge|Episode)\s*\d+\b/i.test(label);
    });

    return Core.dedupeByUrl(episodes.map((link) => ({
      element: link,
      url: Core.normalizeUrl(link.href, location.href),
      label: Core.cleanLabel(link.getAttribute("aria-label") || link.textContent),
      watched: /100\s*(Prozent|Percent)/i.test(link.textContent || "") ||
        Array.from(link.querySelectorAll('[role="progressbar"]')).some((progress) =>
          progress.getAttribute("aria-valuenow") === "100" || /100\s*(Prozent|Percent)/i.test(progress.getAttribute("aria-label") || "")
        )
    })).filter((item) => item.url));
  }

  function seriesTitle() {
    return Core.cleanLabel(document.title.replace(/\s*\|\s*Disney\+.*$/i, "")) || "Disney+-Serie";
  }

  function rememberEpisodeLibrary() {
    if (!pageIsSeriesDetail()) return null;

    const seriesUrl = Core.normalizeUrl(location.href, location.href);
    const discovered = episodeLinks().map((episode) => ({
      url: episode.url,
      label: episode.label,
      watched: episode.watched
    }));
    const previous = state.episodeLibrary.get(seriesUrl) || { episodes: [] };
    const mergedEpisodes = Core.dedupeByUrl([...previous.episodes, ...discovered]);
    const record = {
      seriesUrl,
      title: seriesTitle(),
      episodes: mergedEpisodes,
      updatedAt: Date.now()
    };
    state.episodeLibrary.set(seriesUrl, record);

    const previousSignature = previous.episodes.map((episode) => episode.url).sort().join("|");
    const nextSignature = mergedEpisodes.map((episode) => episode.url).sort().join("|");
    if (previousSignature !== nextSignature || previous.title !== record.title) {
      storageSet({ [EPISODE_LIBRARY_KEY]: [...state.episodeLibrary.values()] });
    }
    return record;
  }

  async function activateCurrentSeries(episodeUrl) {
    const record = rememberEpisodeLibrary();
    if (!record) return null;

    const normalizedEpisodeUrl = Core.normalizeUrl(episodeUrl, location.href);
    state.activeSeries = {
      seriesUrl: record.seriesUrl,
      title: record.title,
      episodeUrls: record.episodes.map((episode) => episode.url),
      lastEpisodeUrl: normalizedEpisodeUrl,
      updatedAt: Date.now()
    };
    await storageSet({ [ACTIVE_SERIES_KEY]: state.activeSeries });
    return state.activeSeries;
  }

  function activeSeriesForCurrentPlayer() {
    if (!pageIsPlayer()) return null;
    const currentUrl = Core.normalizeUrl(location.href, location.href);

    if (state.activeSeries && (
      state.activeSeries.lastEpisodeUrl === currentUrl ||
      state.activeSeries.episodeUrls?.includes(currentUrl)
    )) {
      return state.activeSeries;
    }

    const mapped = state.episodeSeriesMap.get(currentUrl);
    if (mapped?.seriesUrl) {
      const known = state.episodeLibrary.get(mapped.seriesUrl);
      state.activeSeries = {
        seriesUrl: mapped.seriesUrl,
        title: mapped.title || known?.title || "Disney+-Serie",
        episodeUrls: Core.dedupeByUrl([
          ...(known?.episodes || []),
          { url: currentUrl }
        ]).map((episode) => episode.url),
        lastEpisodeUrl: currentUrl,
        updatedAt: Date.now()
      };
      storageSet({ [ACTIVE_SERIES_KEY]: state.activeSeries });
      return state.activeSeries;
    }

    for (const record of state.episodeLibrary.values()) {
      if (!record.episodes.some((episode) => episode.url === currentUrl)) continue;
      state.activeSeries = {
        seriesUrl: record.seriesUrl,
        title: record.title,
        episodeUrls: record.episodes.map((episode) => episode.url),
        lastEpisodeUrl: currentUrl,
        updatedAt: Date.now()
      };
      storageSet({ [ACTIVE_SERIES_KEY]: state.activeSeries });
      return state.activeSeries;
    }

    const playerText = Core.cleanLabel(document.body?.innerText || "").toLocaleLowerCase("de");
    const inferred = [...state.catalog.values()]
      .filter((item) => item.type === "series" && item.title?.length >= 4 && playerText.includes(item.title.toLocaleLowerCase("de")))
      .sort((a, b) => b.title.length - a.title.length)[0];
    if (inferred?.url) {
      state.activeSeries = {
        seriesUrl: inferred.url,
        title: inferred.title,
        episodeUrls: [currentUrl],
        lastEpisodeUrl: currentUrl,
        updatedAt: Date.now()
      };
      storageSet({ [ACTIVE_SERIES_KEY]: state.activeSeries });
      return state.activeSeries;
    }
    return null;
  }

  function seasonDropdown() {
    return Array.from(document.querySelectorAll('button[aria-haspopup="listbox"]')).find((button) =>
      /^(Staffel|Season)\s+\d+$/i.test(button.textContent?.trim() || "") && button.closest('main, [role="tabpanel"]')
    );
  }

  async function chooseRandomSeason() {
    const dropdown = seasonDropdown();
    if (!dropdown || !visible(dropdown)) return false;

    if (dropdown.getAttribute("aria-expanded") !== "true") dropdown.click();
    await waitForCondition(() => document.querySelector('[role="listbox"] [role="option"]'), 1800);
    const options = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).filter(visible);
    if (options.length < 2) {
      dropdown.click();
      return false;
    }

    const selected = pickRandom(options);
    const wasAlreadySelected = selected.getAttribute("aria-selected") === "true";
    const oldSeason = dropdown.textContent?.trim();
    const oldFirstEpisode = episodeLinks()[0]?.url;
    selected.click();
    if (wasAlreadySelected) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      return true;
    }
    await waitForCondition(() => {
      const firstEpisode = episodeLinks()[0]?.url;
      return dropdown.textContent?.trim() !== oldSeason || (firstEpisode && firstEpisode !== oldFirstEpisode);
    }, 3500);
    await new Promise((resolve) => setTimeout(resolve, 260));
    return true;
  }

  async function openRandomEpisode(options = {}) {
    if (!pageIsSeriesDetail()) {
      showToast("Öffne zuerst die Detailseite einer Serie.");
      return;
    }

    await chooseRandomSeason();
    let episodes = episodeLinks();
    if (state.settings.skipWatchedEpisodes) {
      const unseen = episodes.filter((episode) => !episode.watched);
      if (unseen.length) episodes = unseen;
    }

    if (options.excludeUrl) {
      const alternatives = episodes.filter((episode) => episode.url !== options.excludeUrl);
      if (alternatives.length) episodes = alternatives;
    }

    if (!episodes.length) {
      showToast("Auf dieser Seite wurden noch keine Folgen gefunden.");
      return;
    }

    const selected = pickRandom(episodes);
    await activateCurrentSeries(selected.url);
    showToast(`Zufallsfolge: ${selected.label || "Los geht’s"}`);
    setTimeout(() => location.assign(selected.url), 140);
  }

  function findPrimaryPlayLink() {
    return Array.from(document.querySelectorAll('main a[href*="/play/"]')).find((link) => {
      const label = `${link.getAttribute("aria-label") || ""} ${link.textContent || ""}`.trim();
      return /^(ABSPIELEN|WEITER|FORTSETZEN|PLAY|RESUME|CONTINUE)\b/i.test(label) && !/TRAILER|NEUSTART|RESTART/i.test(label);
    });
  }

  function ensureInlineRandomButton() {
    const existing = document.getElementById("dp-random-inline-control");
    const legacyButton = document.getElementById("dp-random-inline-button");
    if (!pageIsSeriesDetail()) {
      existing?.remove();
      legacyButton?.remove();
      return;
    }

    const actions = document.querySelector('[data-testid="details-featured-actions"]');
    if (!actions) return;
    if (existing?.parentElement === actions) {
      const existingButton = existing.querySelector("#dp-random-inline-button");
      if (existingButton) {
        existingButton.setAttribute("aria-label", I18n.t("Zufällige Folge direkt abspielen"));
        existingButton.title = I18n.t("Zufällige Folge");
      }
      return;
    }
    existing?.remove();
    legacyButton?.remove();

    const watchlistWrapper = Array.from(actions.children).find((child) =>
      child.querySelector?.('[data-testid="add-to-watchlist-button"]')
    );
    const watchlistButton = watchlistWrapper?.querySelector('[data-testid="add-to-watchlist-button"]');
    if (!watchlistWrapper || !watchlistButton) return;

    const wrapper = watchlistWrapper.cloneNode(false);
    wrapper.id = "dp-random-inline-control";
    wrapper.removeAttribute("data-testid");

    const button = watchlistButton.cloneNode(false);
    button.id = "dp-random-inline-button";
    button.type = "button";
    button.removeAttribute("data-testid");
    button.setAttribute("aria-label", I18n.t("Zufällige Folge direkt abspielen"));
    button.title = I18n.t("Zufällige Folge");
    button.innerHTML = `
      <svg fill="none" aria-hidden="true" width="20" height="20" viewBox="0 0 28 28">
        <path d="M4 7h2.8c2.7 0 4.3 1.25 5.75 3.55l3.9 6.2C17.65 18.65 19 20 21.3 20H24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="m20.5 16.5 3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 20h2.8c2.7 0 4.3-1.25 5.75-3.55l3.9-6.2C17.65 8.35 19 7 21.3 7H24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20.5 3.5 24 7l-3.5 3.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    button.addEventListener("click", () => openRandomEpisode());
    wrapper.appendChild(button);
    watchlistWrapper.insertAdjacentElement("afterend", wrapper);
  }

  async function queueRandomNextEpisode() {
    if (!state.settings.shufflePlayback || state.shuffleTransitioning || !pageIsPlayer()) return;

    const activeSeries = activeSeriesForCurrentPlayer();
    await refreshPlaybackCollections();
    if (state.playbackSource.kind !== "current") {
      state.shuffleTransitioning = true;
      const started = await openRandomSeriesFromPlaybackSource({
        currentSeriesUrl: activeSeries?.seriesUrl,
        previousEpisodeUrl: Core.normalizeUrl(location.href, location.href)
      });
      if (!started) state.shuffleTransitioning = false;
      return;
    }

    if (!activeSeries?.seriesUrl) {
      showToast("Die Serie konnte noch nicht automatisch erkannt werden. Der Katalogabgleich läuft im Hintergrund.");
      return;
    }

    state.shuffleTransitioning = true;
    const currentEpisodeUrl = Core.normalizeUrl(location.href, location.href);
    await storageSet({
      [PENDING_KEY]: {
        kind: "shuffle-next",
        seriesUrl: activeSeries.seriesUrl,
        previousEpisodeUrl: currentEpisodeUrl,
        createdAt: Date.now()
      }
    });
    location.assign(activeSeries.seriesUrl);
  }

  function handleVideoProgress(event) {
    if (!state.settings.shufflePlayback || state.shuffleTransitioning) return;
    const video = event.currentTarget;
    if (event.type === "timeupdate") {
      if (!Number.isFinite(video.duration) || video.duration < 30 || video.paused) return;
      if (video.duration - video.currentTime > 0.55) return;
    }
    queueRandomNextEpisode();
  }

  function bindPlayerVideos() {
    if (!pageIsPlayer()) return;
    for (const video of document.querySelectorAll("video")) {
      if (state.boundVideos.has(video)) continue;
      state.boundVideos.add(video);
      video.addEventListener("ended", handleVideoProgress);
      video.addEventListener("timeupdate", handleVideoProgress);
    }
  }

  async function setShufflePlayback(enabled) {
    enabled = Boolean(enabled);
    await setSetting("shufflePlayback", enabled);
    if (!enabled) {
      state.shuffleTransitioning = false;
      showToast("Zufallswiedergabe ist aus.");
      return;
    }

    await refreshPlaybackCollections();
    const context = activeSeriesForCurrentPlayer();
    showToast(state.playbackSource.kind === "current"
      ? (context
        ? "Zufallswiedergabe ist an: Nach dieser Folge wird aus der aktuellen Serie neu ausgewählt."
        : "Zufallswiedergabe ist an. Die aktuelle Serie wird automatisch ermittelt.")
      : `Zufallswiedergabe ist an: Nächste Auswahl aus ${playbackSourceLabel()}.`
    );
  }

  function toggleShufflePlayback() {
    return setShufflePlayback(!state.settings.shufflePlayback);
  }

  async function resumePendingAction() {
    const stored = await storageGet(PENDING_KEY);
    const pending = stored[PENDING_KEY];
    if (!pending || Date.now() - pending.createdAt > 20000) {
      if (pending) await storageRemove(PENDING_KEY);
      return;
    }

    if (pending.kind === "autoplay") {
      if (Core.normalizeUrl(location.href, location.href) !== Core.normalizeUrl(pending.targetUrl, location.href)) return;
      const playLink = await waitForCondition(findPrimaryPlayLink, 9000);
      await storageRemove(PENDING_KEY);
      if (playLink) {
        await activateCurrentSeries(playLink.href);
        location.assign(playLink.href);
      }
      else showToast("Serie geöffnet – Disney+ verlangt hier noch einen Klick auf Abspielen.");
      return;
    }

    if (pending.kind === "shuffle-next") {
      if (Core.normalizeUrl(location.href, location.href) !== Core.normalizeUrl(pending.seriesUrl, location.href)) {
        if (pageIsPlayer()) location.assign(pending.seriesUrl);
        return;
      }
      const ready = await waitForCondition(pageIsSeriesDetail, 9000);
      await storageRemove(PENDING_KEY);
      state.shuffleTransitioning = false;
      if (ready) await openRandomEpisode({ excludeUrl: pending.previousEpisodeUrl });
      else showToast("Die Serienseite wurde nicht rechtzeitig geladen. Bitte würfle einmal manuell.");
      return;
    }

    if (pending.kind === "source-play") {
      if (Core.normalizeUrl(location.href, location.href) !== Core.normalizeUrl(pending.seriesUrl, location.href)) {
        if (pageIsPlayer()) location.assign(pending.seriesUrl);
        return;
      }
      const ready = await waitForCondition(pageIsSeriesDetail, 9000);
      await storageRemove(PENDING_KEY);
      state.shuffleTransitioning = false;
      if (ready) await openRandomEpisode({ excludeUrl: pending.previousEpisodeUrl });
      else showToast("Die ausgewählte Serienseite wurde nicht rechtzeitig geladen.");
      return;
    }

    if (pending.kind === "discover") {
      if (pending.mode === "series") {
        const allSeriesTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
          /^(Alle Serien|All Series|All Shows)$/i.test(tab.textContent?.trim() || "")
        );
        if (allSeriesTab && visible(allSeriesTab) && allSeriesTab.getAttribute("aria-selected") !== "true") {
          allSeriesTab.click();
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }

      scanDocument();
      const ready = await waitForCondition(() => candidatesFor(pending.mode).length > 0, 7000);
      await storageRemove(PENDING_KEY);
      if (ready) await openRandomTitle(pending.mode);
      else showToast("Noch keine passenden Karten gefunden. Scrolle kurz durch die Übersicht und probiere es erneut.");
    }
  }

  function waitForCondition(getValue, timeoutMs) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const value = getValue();
        if (value) return resolve(value);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        setTimeout(check, 180);
      };
      check();
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function catalogCategoryTabs() {
    const lists = Array.from(document.querySelectorAll('main [role="tablist"]'));
    const list = lists.find((candidate) => {
      const labels = Array.from(candidate.querySelectorAll('[role="tab"]')).map(tabLabel);
      return labels.length >= 5 && labels.some((label) => ignoredCategory(label));
    });
    return Array.from(list?.querySelectorAll('[role="tab"]') || [])
      .filter((tab) => {
        const label = tabLabel(tab);
        return label && !ignoredCategory(label);
      });
  }

  async function persistAutomaticScanProgress() {
    await storageSet({
      [CATALOG_KEY]: [...state.catalog.values()],
      [FACETS_KEY]: state.facets,
      [EPISODE_SERIES_MAP_KEY]: [...state.episodeSeriesMap.values()]
    });
  }

  async function autoScrollCatalogPage(maxSteps, scanContext = {}) {
    let previousCount = -1;
    let stableRounds = 0;
    for (let step = 0; step < maxSteps; step += 1) {
      scanDocument(scanContext);
      const count = document.querySelectorAll('main a[href*="/browse/entity-"]').length;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 80;
      stableRounds = count === previousCount && atBottom ? stableRounds + 1 : 0;
      if (stableRounds >= 3) break;
      previousCount = count;
      window.scrollBy({ top: Math.max(560, window.innerHeight * 0.82), behavior: "auto" });
      await delay(550);
    }
    scanDocument(scanContext);
    window.scrollTo({ top: 0, behavior: "auto" });
    await delay(300);
  }

  async function runAutomaticCatalogScan(scan) {
    state.autoScanId = scan.scanId;
    state.autoScanSeen.clear();
    state.autoScanRoute = scan.routes?.[scan.routeIndex] || null;
    const main = await waitForCondition(() => document.querySelector("main"), 12000);
    if (!main) throw new Error("Disney+-Inhalte wurden nicht geladen");
    const firstTitle = await waitForCondition(() => document.querySelector('main a[href*="/browse/entity-"]'), 12000);
    if (!firstTitle) throw new Error("Keine Titelkarten gefunden");
    const scope = Core.browseScope(location.href);
    if (scope === "series" || scope === "movies") {
      const tabs = await waitForCondition(() => {
        const found = catalogCategoryTabs();
        return found.length ? found : null;
      }, 10000) || [];
      if (!tabs.length) throw new Error("Kategorien konnten nicht geladen werden");
      const labels = uniqueLabels(tabs.map(tabLabel));
      for (const label of labels) {
        const tab = catalogCategoryTabs().find((candidate) => tabLabel(candidate) === label);
        if (!tab) continue;
        if (tab.getAttribute("aria-selected") !== "true") {
          tab.click();
          await delay(850);
        }
        const isAllSeries = allCategory(label);
        await autoScrollCatalogPage(isAllSeries ? 55 : 18, { category: label });
        // Publish progress after each category. This keeps the popup and filter
        // page current without writing on every scroll step.
        await persistAutomaticScanProgress();
      }
    } else {
      await waitForCondition(() => document.querySelector('main a[href*="/browse/entity-"]'), 12000);
      await autoScrollCatalogPage(55);
      if (/\/home\/?$/i.test(location.pathname)) {
        const list = studioTablist();
        const labels = uniqueLabels(Array.from(list?.querySelectorAll('[role="tab"]') || []).map(tabLabel));
        for (const label of labels) {
          const tab = Array.from(studioTablist()?.querySelectorAll('[role="tab"]') || [])
            .find((candidate) => tabLabel(candidate) === label);
          if (!tab) continue;
          if (tab.getAttribute("aria-selected") !== "true") {
            tab.click();
            await delay(700);
          }
          scanDocument();
          await persistAutomaticScanProgress();
        }
      }
    }
    await persistAutomaticScanProgress();
    const scanCount = [...state.catalog.values()]
      .filter((item) => item.availabilityScanId === scan.scanId).length;
    const studioRoutes = /\/browse\/disneyplus\/?$/i.test(location.pathname) ? discoverStudioRoutes() : [];
    const result = {
      ok: true,
      count: state.catalog.size,
      scanCount,
      scope: scope || currentStudioPage() || activeHomeBrand() || "other",
      studioRoutes
    };
    state.autoScanId = null;
    state.autoScanRoute = null;
    return result;
  }

  async function completeAssignedAutomaticScan(scan) {
    let result;
    try {
      result = await runAutomaticCatalogScan(scan);
    } catch (error) {
      state.autoScanId = null;
      state.autoScanRoute = null;
      result = { ok: false, error: error?.message || "Automatischer Scan fehlgeschlagen" };
    }
    await runtimeSend({ type: "DP_RANDOM_AUTOSCAN_DONE", result });
  }

  async function announceSiteAndRunScannerIfNeeded() {
    const signedIn = await waitForCondition(() => {
      const path = location.pathname.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/|$)/i, "");
      if (!/^\/(?:home|browse(?:\/|$))/i.test(path)) return false;
      const hasCatalogNavigation = Boolean(document.querySelector(
        'a[href*="/browse/series"], a[href$="/series"]'
      ));
      return Boolean(document.querySelector("main") && hasCatalogNavigation);
    }, 12000);
    if (!signedIn) return;
    const siteReady = await runtimeSend({ type: "DP_RANDOM_SITE_READY", url: location.href });
    if (siteReady?.started) {
      showToast("Disney+-Katalog wird kurz im Hintergrund vorbereitet. Bitte einen Moment Geduld.");
    }
    const check = await runtimeSend({ type: "DP_RANDOM_AUTOSCAN_CHECK" });
    if (!check?.ok || !check.scan?.scanId) return;
    await completeAssignedAutomaticScan(check.scan);
  }

  function setPanel(open) {
    state.panelOpen = Boolean(open);
    const root = document.getElementById("dp-random-root");
    root?.classList.toggle("dp-random-open", state.panelOpen);
    root?.querySelector(".dp-random-fab")?.setAttribute("aria-expanded", String(state.panelOpen));
  }

  function showToast(message) {
    ensureUi();
    const toast = document.querySelector("#dp-random-root .dp-random-toast");
    if (!toast) return;
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("dp-random-toast-show");
    state.toastTimer = setTimeout(() => toast.classList.remove("dp-random-toast-show"), 4200);
  }

  async function setSetting(name, value) {
    state.settings = { ...state.settings, [name]: Boolean(value) };
    await storageSet({ [SETTINGS_KEY]: state.settings });
    updateUi();
  }

  function ensureUi() {
    if (!document.body || document.getElementById("dp-random-root")) return;

    const root = document.createElement("aside");
    root.id = "dp-random-root";
    root.setAttribute("aria-label", "Disney+ Zufall");
    root.innerHTML = `
      <div class="dp-random-panel" role="dialog" aria-label="Disney+ Zufallsauswahl">
        <div class="dp-random-heading">
          <h2 class="dp-random-title">Disney+ Zufall</h2>
          <span class="dp-random-count">0 Titel</span>
        </div>
        <div class="dp-random-actions">
          <button class="dp-random-action" type="button" data-action="random-recommendation">
            <span class="dp-random-action-icon" aria-hidden="true">
              <svg fill="none" viewBox="0 0 28 28">
                <path d="M14 3.5c.8 5.35 3.15 7.7 8.5 8.5-5.35.8-7.7 3.15-8.5 8.5-.8-5.35-3.15-7.7-8.5-8.5 5.35-.8 7.7-3.15 8.5-8.5Z" fill="currentColor"/>
                <path d="M22.25 18.5c.35 2.2 1.3 3.15 3.5 3.5-2.2.35-3.15 1.3-3.5 3.5-.35-2.2-1.3-3.15-3.5-3.5 2.2-.35 3.15-1.3 3.5-3.5Z" fill="currentColor" opacity=".72"/>
              </svg>
            </span>
            <span>Zufallsempfehlung</span>
          </button>
          <button class="dp-random-action" type="button" data-action="play-source">
            <span class="dp-random-action-icon" aria-hidden="true">
              <svg fill="none" viewBox="0 0 28 28">
                <path d="M3 7h3.2c2.75 0 4.45 1.25 5.95 3.65l3.75 6c1.25 2 2.7 3.35 5.1 3.35h3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="m20.5 16.5 3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 20h3.2c2.75 0 4.45-1.25 5.95-3.65l3.75-6C17.15 8.35 18.6 7 21 7h3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M20.5 3.5 24 7l-3.5 3.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="dp-random-source-label">Serienmix abspielen</span>
          </button>
          <button class="dp-random-action" type="button" data-action="random-episode">
            <span class="dp-random-action-icon" aria-hidden="true">
              <svg fill="none" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="11" stroke="currentColor" stroke-width="1.8" opacity=".45"/>
                <path d="M10.25 7.4v13.2L21 14 10.25 7.4Z" fill="currentColor"/>
              </svg>
            </span>
            <span>Zufällige Folge</span>
          </button>
        </div>
        <div class="dp-random-settings">
          <label class="dp-random-switch">
            <input type="checkbox" data-setting="autoplay">
            <span>Ausgewählte Serie direkt abspielen</span>
          </label>
          <label class="dp-random-switch">
            <input type="checkbox" data-setting="shufflePlayback">
            <span>Folgen zufällig fortsetzen</span>
          </label>
          <label class="dp-random-switch">
            <input type="checkbox" data-setting="skipWatchedEpisodes">
            <span>Komplett gesehene Folgen auslassen</span>
          </label>
          <p class="dp-random-help">Tipp: Der automatische Abgleich sammelt Serien, Filme, Originals und Specials in deinem lokalen Katalog.</p>
        </div>
      </div>
      <div class="dp-random-toast" role="status" aria-live="polite"></div>
      <button class="dp-random-fab" type="button" aria-label="Disney+ Zufall öffnen" aria-expanded="false">
        <span class="dp-random-die" aria-hidden="true">
          <svg fill="none" viewBox="0 0 28 28">
            <path d="M3 7h3.2c2.75 0 4.45 1.25 5.95 3.65l3.75 6c1.25 2 2.7 3.35 5.1 3.35h3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="m20.5 16.5 3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 20h3.2c2.75 0 4.45-1.25 5.95-3.65l3.75-6C17.15 8.35 18.6 7 21 7h3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20.5 3.5 24 7l-3.5 3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
    `;

    root.querySelector(".dp-random-fab").addEventListener("click", () => {
      if (pageIsPlayer()) toggleShufflePlayback();
      else setPanel(!state.panelOpen);
    });
    root.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        setPanel(false);
        await runAction(button.dataset.action);
      });
    });
    root.querySelectorAll("[data-setting]").forEach((input) => {
      input.addEventListener("change", () => setSetting(input.dataset.setting, input.checked));
    });

    document.body.appendChild(root);
    I18n.observe(root);
    updateUi();
  }

  function publishPlayerState() {
    document.dispatchEvent(new CustomEvent(PLAYER_STATE_EVENT, {
      detail: {
        active: Boolean(state.settings.shufflePlayback),
        sourceLabel: playbackSourceLabel(),
        onLabel: I18n.t("Random: ON"),
        offLabel: I18n.t("Random: OFF")
      }
    }));
  }

  function updateUi() {
    publishPlayerState();
    const root = document.getElementById("dp-random-root");
    if (!root) return;
    const count = root.querySelector(".dp-random-count");
    if (count) count.textContent = `${state.catalog.size} ${state.catalog.size === 1 ? "Titel" : "Titel"}`;
    const sourceLabel = root.querySelector(".dp-random-source-label");
    if (sourceLabel) sourceLabel.textContent = state.playbackSource.kind === "playlist"
      ? `${playbackSourceLabel()} abspielen`
      : "Filter als Serienmix";
    const episodeButton = root.querySelector('[data-action="random-episode"]');
    if (episodeButton) {
      episodeButton.disabled = !pageIsSeriesDetail();
      episodeButton.title = episodeButton.disabled ? "Nur auf einer Serien-Detailseite verfügbar" : "Staffel und Folge zufällig wählen";
    }
    const player = pageIsPlayer();
    root.classList.toggle("dp-random-player", player);
    const fab = root.querySelector(".dp-random-fab");
    if (fab) {
      fab.setAttribute("aria-label", player
        ? `Zufallswiedergabe ${state.settings.shufflePlayback ? "ausschalten" : "einschalten"}`
        : "Disney+ Zufall öffnen"
      );
      fab.title = player
        ? `Zufallswiedergabe: ${state.settings.shufflePlayback ? "AN" : "AUS"}`
        : "Disney+ Zufall";
    }
    for (const [name, value] of Object.entries(state.settings)) {
      const input = root.querySelector(`[data-setting="${name}"]`);
      if (input) input.checked = Boolean(value);
    }
  }

  async function runAction(action) {
    if (action === "random-recommendation") return openRandomTitle("title", { autoplay: false });
    if (action === "play-filter") return startFilterPlayback();
    if (action === "play-source") return startActiveSourcePlayback();
    if (action === "random-series") return openRandomTitle("series");
    if (action === "random-movie") return openRandomTitle("movie");
    if (action === "random-title") return openRandomTitle("title");
    if (action === "random-episode") return openRandomEpisode();
    if (action === "toggle-shuffle") return toggleShufflePlayback();
    if (action === "toggle-panel") return setPanel(!state.panelOpen);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DP_RANDOM_ACTION") {
      Promise.resolve(runAction(message.action))
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Unbekannter Fehler" }));
      return true;
    }

    if (message?.type === "DP_RANDOM_STATE") {
      sendResponse({
        ok: true,
        onDisneyPlus: true,
        seriesCount: [...state.catalog.values()].filter((item) => item.type === "series").length,
        movieCount: [...state.catalog.values()].filter((item) => item.type === "movie").length,
        enabledCount: [...state.catalog.values()].filter((item) => !item.excluded && !state.blocklist.has(item.url)).length,
        titleCount: state.catalog.size,
        facets: state.facets,
        filter: state.filter,
        playbackSource: state.playbackSource,
        playlists: state.playlists.map((playlist) => ({ id: playlist.id, name: playlist.name, count: playlist.seriesUrls.length })),
        seriesDetail: pageIsSeriesDetail(),
        settings: state.settings
      });
    }
    return undefined;
  });

  document.addEventListener(PLAYER_TOGGLE_REQUEST_EVENT, (event) => {
    const requestedState = event.detail?.enabled;
    const enabled = typeof requestedState === "boolean"
      ? requestedState
      : !state.settings.shufflePlayback;
    setShufflePlayback(enabled).catch((error) =>
      console.warn("Disney+ Zufall konnte den Player-Schalter nicht speichern:", error)
    );
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const scanning = Boolean(state.autoScanId);
    if (changes[SETTINGS_KEY]?.newValue) {
      state.settings = { ...DEFAULT_SETTINGS, ...changes[SETTINGS_KEY].newValue };
      if (!state.settings.shufflePlayback) state.shuffleTransitioning = false;
    }
    if (changes[CATALOG_KEY] && !scanning) {
      const catalog = Array.isArray(changes[CATALOG_KEY].newValue) ? changes[CATALOG_KEY].newValue : [];
      state.catalog = new Map(catalog.filter((item) => item?.url).map((item) => [item.url, normalizeCatalogItem(item)]));
    }
    if (changes[BLOCKLIST_KEY]) {
      state.blocklist = new Set(Array.isArray(changes[BLOCKLIST_KEY].newValue) ? changes[BLOCKLIST_KEY].newValue : []);
    }
    if (changes[FACETS_KEY]) state.facets = normalizeFacets(changes[FACETS_KEY].newValue);
    if (changes[FILTER_KEY]) state.filter = Core.normalizeFilter(changes[FILTER_KEY].newValue);
    if (changes[PLAYBACK_SOURCE_KEY]) state.playbackSource = normalizePlaybackSource(changes[PLAYBACK_SOURCE_KEY].newValue);
    if (changes[PLAYLISTS_KEY]) state.playlists = normalizePlaylists(changes[PLAYLISTS_KEY].newValue);
    if (changes[EPISODE_SERIES_MAP_KEY]) {
      const mappings = Array.isArray(changes[EPISODE_SERIES_MAP_KEY].newValue) ? changes[EPISODE_SERIES_MAP_KEY].newValue : [];
      state.episodeSeriesMap = new Map(mappings.filter((item) => item?.episodeUrl).map((item) => [item.episodeUrl, item]));
    }
    if (!scanning) updateUi();
  });

  document.addEventListener("dp-random:language-changed", () => {
    ensureInlineRandomButton();
    updateUi();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.panelOpen) setPanel(false);
  });

  document.addEventListener("click", (event) => {
    const clickedElement = event.target instanceof Element ? event.target : null;
    const playLink = clickedElement?.closest('a[href*="/play/"]');
    if (playLink) {
      rememberContinueWatchingMappings(Date.now());
      const episodeUrl = Core.normalizeUrl(playLink.href, location.href);
      const mapped = state.episodeSeriesMap.get(episodeUrl);
      if (mapped?.seriesUrl) {
        const known = state.episodeLibrary.get(mapped.seriesUrl);
        state.activeSeries = {
          seriesUrl: mapped.seriesUrl,
          title: mapped.title || known?.title || "Disney+-Serie",
          episodeUrls: Core.dedupeByUrl([...(known?.episodes || []), { url: episodeUrl }]).map((episode) => episode.url),
          lastEpisodeUrl: episodeUrl,
          updatedAt: Date.now()
        };
        storageSet({ [ACTIVE_SERIES_KEY]: state.activeSeries });
      }
    }
    if (pageIsSeriesDetail() && playLink) {
      const label = `${playLink.getAttribute("aria-label") || ""} ${playLink.textContent || ""}`;
      if (!/TRAILER/i.test(label)) activateCurrentSeries(playLink.href);
    }

    const root = document.getElementById("dp-random-root");
    if (state.panelOpen && root && !root.contains(event.target)) setPanel(false);
  }, true);

  async function start() {
    const stored = await storageGet([
      ACTIVE_SERIES_KEY,
      BLOCKLIST_KEY,
      CATALOG_KEY,
      EPISODE_LIBRARY_KEY,
      EPISODE_SERIES_MAP_KEY,
      FACETS_KEY,
      FILTER_KEY,
      HISTORY_KEY,
      PLAYBACK_SOURCE_KEY,
      PLAYLISTS_KEY,
      SETTINGS_KEY
    ]);
    const catalog = Array.isArray(stored[CATALOG_KEY]) ? stored[CATALOG_KEY] : [];
    const library = Array.isArray(stored[EPISODE_LIBRARY_KEY]) ? stored[EPISODE_LIBRARY_KEY] : [];
    const episodeSeriesMap = Array.isArray(stored[EPISODE_SERIES_MAP_KEY]) ? stored[EPISODE_SERIES_MAP_KEY] : [];
    state.activeSeries = stored[ACTIVE_SERIES_KEY] || null;
    state.blocklist = new Set(Array.isArray(stored[BLOCKLIST_KEY]) ? stored[BLOCKLIST_KEY] : []);
    state.catalog = new Map(catalog.filter((item) => item?.url).map((item) => [item.url, normalizeCatalogItem(item)]));
    state.episodeLibrary = new Map(library.filter((item) => item?.seriesUrl).map((item) => [item.seriesUrl, item]));
    state.episodeSeriesMap = new Map(episodeSeriesMap.filter((item) => item?.episodeUrl).map((item) => [item.episodeUrl, item]));
    state.history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
    state.facets = normalizeFacets(stored[FACETS_KEY]);
    state.filter = Core.normalizeFilter(stored[FILTER_KEY] || DEFAULT_FILTER);
    state.playbackSource = normalizePlaybackSource(stored[PLAYBACK_SOURCE_KEY]);
    state.playlists = normalizePlaylists(stored[PLAYLISTS_KEY]);
    state.settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };

    // The dedicated scan tab only needs the lightweight collector. Avoid
    // injecting controls, observers, and polling loops into that tab.
    const assignedScan = await runtimeSend({ type: "DP_RANDOM_AUTOSCAN_CHECK" });
    if (assignedScan?.ok && assignedScan.scan?.scanId) {
      await completeAssignedAutomaticScan(assignedScan.scan);
      return;
    }

    if (repairContinueWatchingCatalog()) scheduleCatalogSave();

    ensureUi();
    scanDocument();

    const observer = new MutationObserver(() => {
      if (state.autoScanId || pageIsPlayer()) return;
      ensureUi();
      scheduleScan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    let previousUrl = location.href;
    setInterval(() => {
      if (pageIsPlayer()) {
        bindPlayerVideos();
      }
      if (location.href !== previousUrl) {
        const oldUrl = previousUrl;
        previousUrl = location.href;
        const playerAdvanced = Core.isPlayUrl(oldUrl) && Core.isPlayUrl(location.href) &&
          Core.normalizeUrl(oldUrl, oldUrl) !== Core.normalizeUrl(location.href, location.href);
        if (playerAdvanced && state.settings.shufflePlayback && !state.shuffleTransitioning) {
          if (state.activeSeries?.seriesUrl) {
            state.activeSeries = {
              ...state.activeSeries,
              lastEpisodeUrl: Core.normalizeUrl(location.href, location.href),
              updatedAt: Date.now()
            };
            storageSet({ [ACTIVE_SERIES_KEY]: state.activeSeries });
          }
          setTimeout(queueRandomNextEpisode, 220);
        }
        if (pageIsPlayer()) setPanel(false);
        if (pageIsPlayer()) runtimeSend({ type: "DP_RANDOM_PLAYER_ACTIVE" });
        if (!pageIsPlayer()) scheduleScan();
        setTimeout(updateUi, 400);
      }
    }, 900);

    if (pageIsPlayer()) await runtimeSend({ type: "DP_RANDOM_PLAYER_ACTIVE" });
    await resumePendingAction();
    await announceSiteAndRunScannerIfNeeded();
  }

  start().catch((error) => console.warn("Disney+ Zufall konnte nicht vollständig starten:", error));
})();
