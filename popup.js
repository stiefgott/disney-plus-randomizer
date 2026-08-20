"use strict";

const Core = globalThis.DisneyRandomCore;
const I18n = globalThis.DisneyRandomI18n;
const SETTINGS_KEY = "dpRandom.settings.v1";
const CATALOG_KEY = "dpRandom.catalog.v1";
const FILTER_KEY = "dpRandom.filter.v1";
const AUTO_SCAN_KEY = "dpRandom.autoScan.v1";
const FIRST_RUN_NOTICE_KEY = "dpRandom.firstRunNoticeSeen.v1";
const PLAYBACK_SOURCE_KEY = "dpRandom.playbackSource.v1";
const PLAYLISTS_KEY = "dpRandom.playlists.v1";
const DEFAULT_SETTINGS = { autoplay: true, shufflePlayback: false, skipWatchedEpisodes: false };
let activeTab = null;
let pageState = null;
let catalogState = {
  autoScan: null,
  catalog: [],
  filter: { scope: "all", category: "all", brand: "all", studio: "all" },
  firstRunNoticeSeen: false,
  playbackSource: { kind: "current", playlistId: null },
  playlists: []
};

function queryActiveTab() {
  return new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] || null)));
}

function sendMessage(message) {
  return new Promise((resolve) => {
    if (!activeTab?.id) return resolve(null);
    chrome.tabs.sendMessage(activeTab.id, message, (response) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(response || null);
    });
  });
}

function getSettings() {
  return new Promise((resolve) => chrome.storage.local.get(SETTINGS_KEY, (result) => {
    resolve({ ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) });
  }));
}

function setSettings(settings) {
  return new Promise((resolve) => chrome.storage.local.set({ [SETTINGS_KEY]: settings }, resolve));
}

function getCatalogState() {
  return new Promise((resolve) => chrome.storage.local.get([
    CATALOG_KEY,
    FILTER_KEY,
    AUTO_SCAN_KEY,
    FIRST_RUN_NOTICE_KEY,
    PLAYBACK_SOURCE_KEY,
    PLAYLISTS_KEY
  ], (result) => {
    resolve({
      autoScan: result[AUTO_SCAN_KEY] || null,
      catalog: Array.isArray(result[CATALOG_KEY]) ? result[CATALOG_KEY] : [],
      filter: { scope: "all", category: "all", brand: "all", studio: "all", ...(result[FILTER_KEY] || {}) },
      firstRunNoticeSeen: Boolean(result[FIRST_RUN_NOTICE_KEY]),
      playbackSource: result[PLAYBACK_SOURCE_KEY] || { kind: "current", playlistId: null },
      playlists: Array.isArray(result[PLAYLISTS_KEY]) ? result[PLAYLISTS_KEY] : []
    });
  }));
}

function renderFirstRunLoading(connected) {
  const screen = document.getElementById("first-run-loading");
  const firstBuild = catalogState.autoScan?.active || catalogState.catalog.length === 0;
  if (!catalogState.firstRunNoticeSeen && connected && firstBuild) {
    screen.hidden = false;
    catalogState.firstRunNoticeSeen = true;
    chrome.storage.local.set({ [FIRST_RUN_NOTICE_KEY]: true });
  }
  if (screen.hidden) return;
  const routeLabels = ["Serien", "Filme", "Originals", "Disney+", "Hulu", "Studios"];
  if (catalogState.autoScan?.active) {
    const route = catalogState.autoScan.routes?.[catalogState.autoScan.routeIndex];
    const section = route?.label || route?.studio || routeLabels[catalogState.autoScan.routeIndex] || "Katalog";
    document.getElementById("loading-title").textContent = `${section} werden geladen`;
    const surface = "Ein inaktiver Disney+-Tab";
    document.getElementById("loading-copy").textContent = `${catalogState.catalog.length} Titel bisher. ${surface} arbeitet im Hintergrund.`;
  } else if (catalogState.autoScan?.completedAt) {
    document.getElementById("loading-title").textContent = "Katalog ist bereit";
    document.getElementById("loading-copy").textContent = `${catalogState.autoScan.count || catalogState.catalog.length} Titel wurden lokal vorbereitet.`;
    setTimeout(() => { screen.hidden = true; }, 900);
  }
}

function renderState(settings) {
  const status = document.getElementById("status-text");
  const onDisneyPlus = Boolean(activeTab?.url && /(^|\.)disneyplus\.com/i.test(new URL(activeTab.url).hostname));
  const connected = onDisneyPlus && pageState?.ok;
  const episodeButton = document.querySelector('[data-action="random-episode"]');
  const episodeHint = document.querySelector("[data-episode-hint]");
  const enabled = catalogState.catalog.filter((item) => !item?.excluded).length;
  const filter = catalogState.filter;
  document.body.classList.toggle("is-connected", Boolean(connected));
  renderFirstRunLoading(connected);

  if (!connected) {
    status.textContent = "Öffne zuerst disneyplus.com";
    document.querySelectorAll("[data-action]").forEach((button) => { button.disabled = true; });
  } else {
    const titleCount = catalogState.catalog.length;
    const seriesCount = catalogState.catalog.filter((item) => item?.type === "series").length;
    const movieCount = catalogState.catalog.filter((item) => item?.type === "movie").length;
    status.textContent = `${titleCount} Titel · ${seriesCount} Serien · ${movieCount} Filme`;
    document.querySelectorAll("[data-action]").forEach((button) => { button.disabled = false; });
    episodeButton.disabled = !pageState.seriesDetail;
    if (episodeHint) {
      episodeHint.textContent = pageState.seriesDetail
        ? "Staffel und Folge direkt auswählen"
        : "Auf einer Serienseite verfügbar";
    }
  }

  for (const [name, value] of Object.entries(settings)) {
    const input = document.querySelector(`[data-setting="${name}"]`);
    if (input) input.checked = Boolean(value);
  }

  const filterParts = [];
  if (filter.scope !== "all") filterParts.push({ series: "Serien", movies: "Filme", originals: "Originals" }[filter.scope] || filter.scope);
  if (filter.category !== "all") filterParts.push(filter.category);
  if (filter.brand !== "all") filterParts.push(filter.brand);
  if (filter.studio !== "all") filterParts.push(filter.studio);
  document.getElementById("catalog-summary-text").textContent = catalogState.autoScan?.active
    ? "Automatischer Katalogabgleich läuft …"
    : `${enabled} aktiv${filterParts.length ? ` · ${filterParts.join(" · ")}` : " · alle Filter offen"}`;
  const matchingTitles = catalogState.catalog.filter((item) => !item?.excluded && Core.itemMatchesFilter(item, filter));
  const matchingSeries = matchingTitles.filter((item) => item?.type === "series");
  const matchingMovies = matchingTitles.filter((item) => item?.type === "movie" || item?.type === "special");
  const recommendationButton = document.getElementById("recommendation-action");
  const recommendationLabel = document.getElementById("recommendation-label");
  const recommendationHint = document.getElementById("recommendation-hint");
  recommendationLabel.textContent = filter.scope === "movies"
    ? "Filmempfehlung"
    : filter.scope === "series"
      ? "Serienempfehlung"
      : filter.scope === "originals"
        ? "Original-Empfehlung"
        : "Zufallsempfehlung";
  recommendationHint.textContent = filterParts.length
    ? `${matchingTitles.length} passend · nur Details öffnen`
    : `${matchingTitles.length} Titel · nur Details öffnen`;

  const playButton = document.getElementById("play-source-action");
  const playLabel = document.getElementById("play-source-label");
  const playHint = document.getElementById("play-source-hint");
  const activePlaylist = catalogState.playbackSource?.kind === "playlist"
    ? catalogState.playlists.find((playlist) => playlist.id === catalogState.playbackSource.playlistId)
    : null;
  if (activePlaylist) {
    const playlistKeys = new Set((activePlaylist.seriesUrls || []).map(Core.entityKey).filter(Boolean));
    const available = catalogState.catalog.filter((item) => item?.type === "series" && !item?.excluded && playlistKeys.has(Core.entityKey(item.url)));
    playButton.dataset.action = "play-source";
    playLabel.textContent = "Playlist zufällig abspielen";
    playHint.textContent = `${activePlaylist.name} · ${available.length} ${available.length === 1 ? "Serie" : "Serien"}`;
    if (connected) playButton.disabled = available.length === 0;
  } else {
    playButton.dataset.action = "play-filter";
    const playMovies = filter.scope === "movies" || (!matchingSeries.length && matchingMovies.length > 0);
    playLabel.textContent = playMovies ? "Zufälligen Film abspielen" : "Filter als Serienmix";
    playHint.textContent = playMovies
      ? `${matchingMovies.length} ${matchingMovies.length === 1 ? "Film" : "Filme"} · direkt starten`
      : `${matchingSeries.length} ${matchingSeries.length === 1 ? "Serie" : "Serien"} · Serie und Folge würfeln`;
    if (connected) playButton.disabled = playMovies ? matchingMovies.length === 0 : matchingSeries.length === 0;
  }
  const shuffleHint = document.getElementById("shuffle-playback-hint");
  if (shuffleHint) {
    shuffleHint.textContent = activePlaylist
      ? `Nächste Auswahl aus „${activePlaylist.name}“`
      : catalogState.playbackSource?.kind === "filter"
        ? "Nächste Auswahl aus dem aktiven Filter"
        : "Nächste Auswahl aus der aktuellen Serie";
  }
  if (connected) recommendationButton.disabled = matchingTitles.length === 0;
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    await sendMessage({ type: "DP_RANDOM_ACTION", action: button.dataset.action });
    window.close();
  });
});

document.querySelectorAll("[data-setting]").forEach((input) => {
  input.addEventListener("change", async () => {
    const settings = await getSettings();
    settings[input.dataset.setting] = input.checked;
    await setSettings(settings);
    renderState(settings);
  });
});

document.getElementById("open-help").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("help.html") });
  window.close();
});

document.getElementById("open-catalog").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("catalog.html") });
  window.close();
});

document.getElementById("dismiss-loading").addEventListener("click", () => {
  document.getElementById("first-run-loading").hidden = true;
});

document.getElementById("language-select").addEventListener("change", async (event) => {
  await I18n.setLanguage(event.target.value);
  renderState(catalogState.settings || DEFAULT_SETTINGS);
});

document.addEventListener("dp-random:language-changed", (event) => {
  const select = document.getElementById("language-select");
  if (select) select.value = event.detail?.language || I18n.language;
  if (catalogState.settings) renderState(catalogState.settings);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[AUTO_SCAN_KEY]) catalogState.autoScan = changes[AUTO_SCAN_KEY].newValue || null;
  if (changes[CATALOG_KEY]) catalogState.catalog = Array.isArray(changes[CATALOG_KEY].newValue) ? changes[CATALOG_KEY].newValue : [];
  if (changes[FILTER_KEY]) catalogState.filter = { scope: "all", category: "all", brand: "all", studio: "all", ...(changes[FILTER_KEY].newValue || {}) };
  if (changes[PLAYBACK_SOURCE_KEY]) catalogState.playbackSource = changes[PLAYBACK_SOURCE_KEY].newValue || { kind: "current", playlistId: null };
  if (changes[PLAYLISTS_KEY]) catalogState.playlists = Array.isArray(changes[PLAYLISTS_KEY].newValue) ? changes[PLAYLISTS_KEY].newValue : [];
  renderState(catalogState.settings || DEFAULT_SETTINGS);
});

(async () => {
  await I18n.ready;
  document.getElementById("language-select").value = I18n.language;
  activeTab = await queryActiveTab();
  const settings = await getSettings();
  catalogState = await getCatalogState();
  catalogState.settings = settings;
  pageState = await sendMessage({ type: "DP_RANDOM_STATE" });
  renderState(settings);
})();
