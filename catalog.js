"use strict";

const Core = globalThis.DisneyRandomCore;
const I18n = globalThis.DisneyRandomI18n;
const KEYS = {
  activeSeries: "dpRandom.activeSeries.v1",
  blocklist: "dpRandom.blocklist.v1",
  catalog: "dpRandom.catalog.v1",
  episodeLibrary: "dpRandom.episodeLibrary.v1",
  episodeSeriesMap: "dpRandom.episodeSeriesMap.v1",
  facets: "dpRandom.facets.v1",
  filter: "dpRandom.filter.v1",
  history: "dpRandom.history.v1",
  pending: "dpRandom.pending.v1",
  playbackSource: "dpRandom.playbackSource.v1",
  playlists: "dpRandom.playlists.v1"
};
const DEFAULT_FILTER = { scope: "all", category: "all", brand: "all", studio: "all" };
const DEFAULT_PLAYBACK_SOURCE = { kind: "current", playlistId: null };
const CATALOG_PAGE_SIZE = 120;
const AUTO_SCAN_KEY = "dpRandom.autoScan.v1";
let catalog = [];
let facets = { series: [], movies: [], originals: [], brands: [], studios: [] };
let randomFilter = { ...DEFAULT_FILTER };
let blocklist = [];
let autoScan = null;
let playlists = [];
let playbackSource = { ...DEFAULT_PLAYBACK_SOURCE };
let editingPlaylistId = null;
let pendingDeletePlaylistId = null;
let visibleItems = [];
let visibleLimit = CATALOG_PAGE_SIZE;
let toastTimer = null;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function cleanList(values) {
  return [...new Set((values || []).map(Core.cleanLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

function normalizeItem(item) {
  return {
    ...item,
    brands: cleanList(item?.brands),
    categories: {
      series: cleanList(item?.categories?.series),
      movies: cleanList(item?.categories?.movies),
      originals: cleanList(item?.categories?.originals)
    },
    excluded: Boolean(item?.excluded),
    sources: cleanList(item?.sources),
    studios: cleanList(item?.studios),
    title: Core.cleanLabel(item?.title) || "Disney+-Titel",
    type: ["series", "movie", "special", "unknown"].includes(item?.type) ? item.type : "unknown"
  };
}

function normalizeFacets(value) {
  return {
    series: cleanList(value?.series),
    movies: cleanList(value?.movies),
    originals: cleanList(value?.originals),
    brands: cleanList(value?.brands),
    studios: cleanList(value?.studios)
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
    const seriesUrls = [...new Set((playlist?.seriesUrls || []).filter((url) =>
      typeof url === "string" && /^https:\/\/([^.]+\.)?disneyplus\.com\//i.test(url)
    ))];
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

function playlistById(id) {
  return playlists.find((playlist) => playlist.id === id) || null;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function runtimeSend(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return resolve(null);
    resolve(response || null);
  }));
}

function queryDisneyTabs() {
  return new Promise((resolve) => chrome.tabs.query({ url: ["https://disneyplus.com/*", "https://*.disneyplus.com/*"] }, resolve));
}

function getCurrentWindow() {
  return new Promise((resolve) => chrome.windows.getCurrent((window) => resolve(window || null)));
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) return resolve(null);
    resolve(response || null);
  }));
}

async function runDisneyAction(action) {
  const [tabs, currentWindow] = await Promise.all([queryDisneyTabs(), getCurrentWindow()]);
  const usableTabs = tabs.filter((item) => item.id !== autoScan?.tabId && item.url && /disneyplus\.com/i.test(item.url));
  const tab = usableTabs.find((item) => item.windowId === currentWindow?.id && item.active) ||
    usableTabs.find((item) => item.windowId === currentWindow?.id) ||
    usableTabs[0];
  if (!tab?.id) {
    showToast("Öffne Disney+ einmal, damit die Auswahl gestartet werden kann.");
    return false;
  }
  const response = await sendTabMessage(tab.id, { type: "DP_RANDOM_ACTION", action });
  if (!response?.ok) {
    showToast("Der Disney+-Tab muss nach dem Extension-Update einmal neu geladen werden.");
    return false;
  }
  chrome.tabs.update(tab.id, { active: true });
  if (Number.isInteger(tab.windowId)) chrome.windows.update(tab.windowId, { focused: true });
  return true;
}

function renderAutoScan() {
  const status = document.getElementById("scan-status");
  const button = document.getElementById("start-auto-scan");
  const labels = ["Serien", "Filme", "Originals", "Disney+", "Hulu", "Studios & Weiterschauen"];
  status.classList.toggle("is-running", Boolean(autoScan?.active));
  button.disabled = Boolean(autoScan?.active);
  if (autoScan?.active) {
    const route = autoScan.routes?.[autoScan.routeIndex];
    const section = route?.label || route?.studio || labels[autoScan.routeIndex] || "Katalog";
    status.querySelector("span").textContent = `${section} wird eingelesen · ${catalog.length} Titel bisher · das kann einige Minuten dauern`;
    button.textContent = "Abgleich läuft …";
  } else if (autoScan?.completedAt) {
    const time = new Intl.DateTimeFormat(I18n.language, { hour: "2-digit", minute: "2-digit" }).format(autoScan.completedAt);
    status.querySelector("span").textContent = autoScan.errors
      ? `Abgleich um ${time} unvollständig · wird in der nächsten Sitzung erneut versucht`
      : `${autoScan.count || 0} aktuelle Titel · zuletzt um ${time} abgeglichen`;
    button.textContent = "Erneut vollständig abgleichen";
  } else if (autoScan?.abortedAt) {
    const playbackWon = autoScan.abortReason === "Wiedergabe hat Vorrang";
    status.querySelector("span").textContent = playbackWon
      ? "Abgleich pausiert · deine Videowiedergabe hatte Vorrang"
      : "Abgleich gestoppt · bitte zuerst vollständig bei Disney+ anmelden";
    button.textContent = playbackWon ? "Abgleich später fortsetzen" : "Nach der Anmeldung erneut versuchen";
  } else {
    status.querySelector("span").textContent = "Startet beim ersten Disney+-Besuch jeder Browsersitzung automatisch";
    button.textContent = "Jetzt vollständig abgleichen";
  }
}

function markSaving() {
  const status = document.getElementById("saved-state");
  status.classList.add("saving");
  status.lastChild.textContent = " Wird gespeichert …";
  setTimeout(() => {
    status.classList.remove("saving");
    status.lastChild.textContent = " Automatisch gespeichert";
  }, 420);
}

function fillSelect(select, items, allLabel, selected) {
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = allLabel;
  select.append(all);
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    option.setAttribute("translate", "no");
    select.append(option);
  }
  select.value = [...select.options].some((option) => option.value === selected) ? selected : "all";
}

function typeLabel(type) {
  return { series: "Serie", movie: "Film", special: "Special", unknown: "Offen" }[type] || "Titel";
}

function randomCandidates() {
  return catalog.filter((item) => !item.excluded && !blocklist.includes(item.url) && Core.itemMatchesFilter(item, randomFilter));
}

function randomSeriesCandidates() {
  return randomCandidates().filter((item) => item.type === "series");
}

function renderFilterControls() {
  randomFilter = Core.normalizeFilter(randomFilter);
  const scope = document.getElementById("random-scope");
  const category = document.getElementById("random-category");
  const brand = document.getElementById("random-brand");
  const studio = document.getElementById("random-studio");
  scope.value = randomFilter.scope;
  const categoryItems = randomFilter.scope === "all" ? [] : (facets[randomFilter.scope] || []);
  fillSelect(category, categoryItems, "Alle Kategorien", randomFilter.category);
  category.disabled = randomFilter.scope === "all";
  fillSelect(brand, cleanList(["Disney+", "Hulu", ...facets.brands]), "Disney+ & Hulu", randomFilter.brand);
  fillSelect(studio, facets.studios, "Alle Studios", randomFilter.studio);
  document.getElementById("studio-field").hidden = randomFilter.brand !== "Disney+";
  const studioUnavailable = randomFilter.studio !== "all" && !facets.studios.includes(randomFilter.studio);
  if ((randomFilter.brand !== "Disney+" || studioUnavailable) && randomFilter.studio !== "all") {
    randomFilter.studio = "all";
    studio.value = "all";
    storageSet({ [KEYS.filter]: randomFilter });
  }
  const matches = randomCandidates();
  const seriesMatches = matches.filter((item) => item.type === "series");
  const movieMatches = matches.filter((item) => item.type === "movie" || item.type === "special");
  document.getElementById("filter-count").textContent = `${matches.length} ${matches.length === 1 ? "Titel" : "Titel"}`;
  const parts = [];
  if (randomFilter.scope !== "all") parts.push({ series: "Serien", movies: "Filme", originals: "Originals" }[randomFilter.scope]);
  if (randomFilter.category !== "all") parts.push(randomFilter.category);
  if (randomFilter.brand !== "all") parts.push(randomFilter.brand);
  if (randomFilter.studio !== "all") parts.push(randomFilter.studio);
  document.getElementById("filter-description").textContent = parts.length
    ? `passen zu: ${parts.join(" · ")}.`
    : "stehen aktuell für jede Zufallsauswahl bereit.";
  const recommendButton = document.getElementById("recommend-filter");
  const playButton = document.getElementById("play-filter");
  const playMovies = randomFilter.scope === "movies" || (!seriesMatches.length && movieMatches.length > 0);
  recommendButton.disabled = matches.length === 0;
  playButton.disabled = playMovies ? movieMatches.length === 0 : seriesMatches.length === 0;
  playButton.textContent = playMovies
    ? movieMatches.length === 1
      ? "1 Film zufällig abspielen"
      : `${movieMatches.length} Filme zufällig abspielen`
    : seriesMatches.length === 1
      ? "1 Serie zufällig abspielen"
      : `${seriesMatches.length} Serien zufällig abspielen`;
}

async function saveRandomFilter() {
  markSaving();
  const scope = document.getElementById("random-scope").value;
  const availableCategories = scope === "all" ? [] : (facets[scope] || []);
  const selectedCategory = document.getElementById("random-category").value;
  randomFilter = Core.normalizeFilter({
    scope,
    category: availableCategories.includes(selectedCategory) ? selectedCategory : "all",
    brand: document.getElementById("random-brand").value,
    studio: document.getElementById("random-studio").value
  });
  if (randomFilter.brand !== "Disney+") randomFilter.studio = "all";
  await storageSet({ [KEYS.filter]: randomFilter });
  renderFilterControls();
  renderCatalog();
}

function selectedViewItems() {
  const query = Core.cleanLabel(document.getElementById("catalog-search").value).toLocaleLowerCase("de");
  const type = document.getElementById("view-type").value;
  const status = document.getElementById("view-status").value;
  const brand = document.getElementById("view-brand").value;
  const category = document.getElementById("view-category").value;
  return catalog.filter((item) => {
    if (query && !item.title.toLocaleLowerCase("de").includes(query)) return false;
    if (type !== "all" && item.type !== type) return false;
    if (status === "enabled" && item.excluded) return false;
    if (status === "excluded" && !item.excluded) return false;
    if (brand !== "all" && !item.brands.includes(brand)) return false;
    if (category !== "all" && !Object.values(item.categories).flat().includes(category)) return false;
    return true;
  }).sort((a, b) => a.title.localeCompare(b.title, "de"));
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("fill", "none");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(svg.namespaceURI, "path");
  const paths = {
    open: "M8 16 16 8M10 8h6v6",
    power: "M12 3.5v8M7.1 6.7a7 7 0 1 0 9.8 0",
    playlist: "M5 6.5h10M5 11h10M5 15.5h6M18 13v6M15 16h6",
    delete: "M5 7h14M9 7V4.5h6V7m-8 0 .8 12h8.4L17 7M10 10.5v5M14 10.5v5"
  };
  path.setAttribute("d", paths[name]);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function addBadge(container, text, className = "") {
  if (!text) return;
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = text;
  badge.title = text;
  container.append(badge);
}

function playlistSeries(playlist) {
  const allowed = new Set((playlist?.seriesUrls || []).map(Core.entityKey).filter(Boolean));
  return catalog.filter((item) => item.type === "series" && allowed.has(Core.entityKey(item.url)));
}

function renderPlaylistEditor() {
  const select = document.getElementById("edit-playlist");
  const hint = document.getElementById("edit-playlist-hint");
  if (!select || !hint) return;
  if (!playlistById(editingPlaylistId)) editingPlaylistId = playlists[0]?.id || null;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = playlists.length ? "Playlist auswählen" : "Erst eine Playlist erstellen";
  select.append(empty);
  for (const playlist of playlists) {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = playlist.name;
    option.setAttribute("translate", "no");
    select.append(option);
  }
  select.value = editingPlaylistId || "";
  select.disabled = playlists.length === 0;
  const selected = playlistById(editingPlaylistId);
  hint.textContent = selected
    ? `${selected.seriesUrls.length} ${selected.seriesUrls.length === 1 ? "Serie" : "Serien"} enthalten · Mit dem Listenknopf an den Serien ändern.`
    : "Erstelle zuerst eine Playlist und füge danach Serien aus dem Katalog hinzu.";
}

function renderPlaylists() {
  const grid = document.getElementById("playlist-grid");
  const empty = document.getElementById("playlist-empty");
  if (!grid || !empty) return;
  grid.replaceChildren();
  empty.hidden = playlists.length > 0;

  for (const playlist of playlists) {
    const card = document.createElement("article");
    const active = playbackSource.kind === "playlist" && playbackSource.playlistId === playlist.id;
    card.className = `playlist-card${active ? " is-active" : ""}${editingPlaylistId === playlist.id ? " is-editing" : ""}`;

    const top = document.createElement("div");
    top.className = "playlist-card-top";
    const title = document.createElement("div");
    const kicker = document.createElement("span");
    kicker.textContent = active ? "Aktive Wiedergabequelle" : "Lokale Serien-Playlist";
    const heading = document.createElement("h3");
    heading.textContent = playlist.name;
    heading.setAttribute("translate", "no");
    title.append(kicker, heading);
    const count = document.createElement("strong");
    count.textContent = String(playlist.seriesUrls.length);
    count.title = `${playlist.seriesUrls.length} Serien`;
    top.append(title, count);

    const names = playlistSeries(playlist).map((item) => item.title);
    const preview = document.createElement("p");
    preview.textContent = names.length
      ? `${names.slice(0, 4).join(" · ")}${names.length > 4 ? ` +${names.length - 4}` : ""}`
      : "Noch keine Serien hinzugefügt.";
    if (names.length) preview.setAttribute("translate", "no");

    const actions = document.createElement("div");
    actions.className = "playlist-card-actions";
    const play = document.createElement("button");
    play.type = "button";
    play.className = "playlist-play";
    play.textContent = active ? "Aktiv · Jetzt abspielen" : "Aktivieren & abspielen";
    play.disabled = playlist.seriesUrls.length === 0;
    play.addEventListener("click", () => activatePlaylist(playlist.id));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = editingPlaylistId === playlist.id ? "Wird bearbeitet" : "Bearbeiten";
    edit.addEventListener("click", () => {
      editingPlaylistId = playlist.id;
      renderPlaylistEditor();
      renderPlaylists();
      renderCatalog();
      document.getElementById("catalog-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "playlist-delete";
    remove.textContent = "Löschen";
    remove.addEventListener("click", () => {
      pendingDeletePlaylistId = playlist.id;
      document.getElementById("playlist-delete-name").textContent = playlist.name;
      document.getElementById("playlist-delete-dialog").showModal();
    });
    actions.append(play, edit, remove);
    card.append(top, preview, actions);
    grid.append(card);
  }
  renderPlaylistEditor();
}

async function savePlaylists(message) {
  await storageSet({ [KEYS.playlists]: playlists });
  renderPlaylists();
  renderCatalog();
  if (message) showToast(message);
}

async function createPlaylist(name) {
  name = Core.cleanLabel(name).slice(0, 48);
  if (!name) return;
  const id = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  playlists.push({ id, name, seriesUrls: [], createdAt: Date.now(), updatedAt: Date.now() });
  editingPlaylistId = id;
  await savePlaylists(`Playlist „${name}“ erstellt.`);
}

async function toggleSeriesInEditingPlaylist(url) {
  const playlist = playlistById(editingPlaylistId);
  if (!playlist) {
    showToast("Erstelle oder wähle zuerst eine Playlist.");
    return;
  }
  const key = Core.entityKey(url);
  const included = playlist.seriesUrls.some((item) => Core.entityKey(item) === key);
  playlist.seriesUrls = included
    ? playlist.seriesUrls.filter((item) => Core.entityKey(item) !== key)
    : [...playlist.seriesUrls.filter((item) => Core.entityKey(item) !== key), url];
  playlist.updatedAt = Date.now();
  await savePlaylists(included ? "Serie aus Playlist entfernt." : "Serie zur Playlist hinzugefügt.");
}

async function activatePlaylist(id) {
  const playlist = playlistById(id);
  if (!playlist?.seriesUrls.length) return;
  playbackSource = { kind: "playlist", playlistId: id };
  await storageSet({ [KEYS.playbackSource]: playbackSource });
  renderPlaylists();
  showToast(`Playlist „${playlist.name}“ wird gestartet …`);
  await runDisneyAction("play-source");
}

async function deletePendingPlaylist() {
  const playlist = playlistById(pendingDeletePlaylistId);
  if (!playlist) return;
  playlists = playlists.filter((item) => item.id !== playlist.id);
  if (editingPlaylistId === playlist.id) editingPlaylistId = playlists[0]?.id || null;
  const values = { [KEYS.playlists]: playlists };
  if (playbackSource.kind === "playlist" && playbackSource.playlistId === playlist.id) {
    playbackSource = { ...DEFAULT_PLAYBACK_SOURCE };
    values[KEYS.playbackSource] = playbackSource;
  }
  pendingDeletePlaylistId = null;
  await storageSet(values);
  renderPlaylists();
  renderCatalog();
  showToast(`Playlist „${playlist.name}“ gelöscht.`);
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = `title-card${item.excluded ? " is-excluded" : ""}`;
  card.dataset.url = item.url;

  const poster = document.createElement("div");
  poster.className = "poster";
  if (/^https:\/\//i.test(item.imageUrl || "")) {
    const image = document.createElement("img");
    image.src = item.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove());
    poster.append(image);
  } else {
    poster.append(icon("open"));
  }

  const info = document.createElement("div");
  info.className = "title-info";
  const title = document.createElement("h3");
  title.textContent = item.title;
  title.setAttribute("translate", "no");
  title.title = item.title;
  const badges = document.createElement("div");
  badges.className = "badges";
  addBadge(badges, typeLabel(item.type), "type");
  item.brands.slice(0, 2).forEach((value) => addBadge(badges, value, "brand"));
  item.studios.slice(0, 1).forEach((value) => addBadge(badges, value, "brand"));
  const category = cleanList(Object.values(item.categories).flat())[0];
  addBadge(badges, category);
  info.append(title, badges);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const open = document.createElement("a");
  open.href = item.url;
  open.target = "_blank";
  open.rel = "noreferrer";
  open.title = "Bei Disney+ öffnen";
  open.append(icon("open"));
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = `toggle${item.excluded ? "" : " is-on"}`;
  toggle.title = item.excluded ? "Für Zufall aktivieren" : "Für Zufall pausieren";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.append(icon("power"));
  toggle.addEventListener("click", () => toggleItem(item.url));
  const playlist = document.createElement("button");
  playlist.type = "button";
  playlist.className = "playlist-add";
  const editing = playlistById(editingPlaylistId);
  const itemKey = Core.entityKey(item.url);
  const inPlaylist = Boolean(editing?.seriesUrls.some((url) => Core.entityKey(url) === itemKey));
  playlist.classList.toggle("is-on", inPlaylist);
  playlist.disabled = item.type !== "series" || !editing;
  playlist.title = item.type !== "series"
    ? "Nur Serien können einer Serien-Playlist hinzugefügt werden"
    : !editing
      ? "Erst eine Playlist erstellen oder auswählen"
      : inPlaylist
        ? `Aus „${editing.name}“ entfernen`
        : `Zu „${editing.name}“ hinzufügen`;
  playlist.setAttribute("aria-label", playlist.title);
  playlist.append(icon("playlist"));
  playlist.addEventListener("click", () => toggleSeriesInEditingPlaylist(item.url));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete";
  remove.title = "Aus Katalog löschen";
  remove.setAttribute("aria-label", `${item.title} löschen`);
  remove.append(icon("delete"));
  remove.addEventListener("click", () => deleteItem(item.url));
  actions.append(open, toggle, playlist, remove);
  card.append(poster, info, actions);
  return card;
}

function renderStats() {
  document.getElementById("stat-total").textContent = String(catalog.length);
  document.getElementById("stat-enabled").textContent = String(catalog.filter((item) => !item.excluded).length);
  document.getElementById("stat-series").textContent = String(catalog.filter((item) => item.type === "series").length);
  document.getElementById("stat-movies").textContent = String(catalog.filter((item) => item.type === "movie").length);
}

function renderCatalog() {
  visibleItems = selectedViewItems();
  const renderedItems = visibleItems.slice(0, visibleLimit);
  document.getElementById("visible-count").textContent = `${renderedItems.length} / ${visibleItems.length}`;
  const grid = document.getElementById("catalog-grid");
  grid.replaceChildren(...renderedItems.map(createCard));
  const loadMore = document.getElementById("load-more-titles");
  const remaining = Math.max(0, visibleItems.length - renderedItems.length);
  loadMore.hidden = remaining === 0;
  loadMore.textContent = `Weitere ${Math.min(CATALOG_PAGE_SIZE, remaining)} Titel anzeigen`;
  const empty = document.getElementById("empty-state");
  empty.hidden = visibleItems.length > 0;
  document.getElementById("empty-copy").textContent = catalog.length
    ? "Passe Suche oder Ansichtsfilter an, um wieder Titel zu sehen."
    : "Öffne bei Disney+ eine Übersicht oder Kategorie und scrolle durch die Titel.";
  renderStats();
  renderFilterControls();
  renderPlaylistEditor();
}

async function saveCatalog(message) {
  await storageSet({ [KEYS.catalog]: catalog });
  renderCatalog();
  if (message) showToast(message);
}

async function toggleItem(url) {
  catalog = catalog.map((item) => item.url === url ? { ...item, excluded: !item.excluded } : item);
  const item = catalog.find((candidate) => candidate.url === url);
  await saveCatalog(item?.excluded ? "Titel für Zufall pausiert." : "Titel wieder aktiviert.");
}

async function deleteItem(url) {
  const item = catalog.find((candidate) => candidate.url === url);
  if (!item) return;
  catalog = catalog.filter((candidate) => candidate.url !== url);
  const deletedKey = Core.entityKey(url);
  playlists = playlists.map((playlist) => ({
    ...playlist,
    seriesUrls: playlist.seriesUrls.filter((item) => Core.entityKey(item) !== deletedKey),
    updatedAt: playlist.seriesUrls.some((item) => Core.entityKey(item) === deletedKey) ? Date.now() : playlist.updatedAt
  }));
  blocklist = cleanList([...blocklist, url]);
  await storageSet({ [KEYS.catalog]: catalog, [KEYS.blocklist]: blocklist, [KEYS.playlists]: playlists });
  renderPlaylists();
  renderCatalog();
  showToast(`${item.title} wurde gelöscht.`);
}

async function setVisibleExcluded(excluded) {
  const urls = new Set(visibleItems.map((item) => item.url));
  catalog = catalog.map((item) => urls.has(item.url) ? { ...item, excluded } : item);
  await saveCatalog(excluded ? "Sichtbare Titel pausiert." : "Sichtbare Titel aktiviert.");
}

function populateViewBrand() {
  const selected = document.getElementById("view-brand").value;
  const fromCatalog = catalog.flatMap((item) => item.brands);
  fillSelect(document.getElementById("view-brand"), cleanList(["Disney+", "Hulu", ...facets.brands, ...fromCatalog]), "Alle Herkünfte", selected);
}

function populateViewCategory() {
  const selected = document.getElementById("view-category").value;
  const fromCatalog = catalog.flatMap((item) => Object.values(item.categories).flat());
  const fromFacets = [...facets.series, ...facets.movies, ...facets.originals];
  fillSelect(document.getElementById("view-category"), cleanList([...fromFacets, ...fromCatalog]), "Alle Kategorien", selected);
}

async function resetCatalog() {
  await storageRemove(Object.values(KEYS));
  randomFilter = { ...DEFAULT_FILTER };
  catalog = [];
  blocklist = [];
  facets = { series: [], movies: [], originals: [], brands: [], studios: [] };
  playlists = [];
  playbackSource = { ...DEFAULT_PLAYBACK_SOURCE };
  editingPlaylistId = null;
  visibleLimit = CATALOG_PAGE_SIZE;
  await storageSet({ [KEYS.filter]: randomFilter, [KEYS.playbackSource]: playbackSource, [KEYS.playlists]: playlists });
  populateViewBrand();
  populateViewCategory();
  renderPlaylists();
  renderCatalog();
  showToast("Der lokale Katalog wurde zurückgesetzt.");
}

for (const id of ["catalog-search", "view-type", "view-status", "view-brand", "view-category"]) {
  document.getElementById(id).addEventListener(id === "catalog-search" ? "input" : "change", () => {
    visibleLimit = CATALOG_PAGE_SIZE;
    renderCatalog();
  });
}
document.getElementById("load-more-titles").addEventListener("click", () => {
  visibleLimit += CATALOG_PAGE_SIZE;
  renderCatalog();
});
for (const id of ["random-scope", "random-category", "random-brand", "random-studio"]) {
  document.getElementById(id).addEventListener("change", saveRandomFilter);
}
document.getElementById("clear-random-filter").addEventListener("click", async () => {
  randomFilter = { ...DEFAULT_FILTER };
  await storageSet({ [KEYS.filter]: randomFilter });
  renderCatalog();
  showToast("Zufallsfilter zurückgesetzt.");
});
document.getElementById("recommend-filter").addEventListener("click", () => runDisneyAction("random-recommendation"));
document.getElementById("play-filter").addEventListener("click", async () => {
  playbackSource = { kind: "filter", playlistId: null };
  await storageSet({ [KEYS.playbackSource]: playbackSource });
  renderPlaylists();
  await runDisneyAction("play-filter");
});
document.getElementById("playlist-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("playlist-name");
  await createPlaylist(input.value);
  input.value = "";
});
document.getElementById("edit-playlist").addEventListener("change", (event) => {
  editingPlaylistId = event.target.value || null;
  renderPlaylists();
  renderCatalog();
});
document.getElementById("use-current-series").addEventListener("click", async () => {
  playbackSource = { ...DEFAULT_PLAYBACK_SOURCE };
  await storageSet({ [KEYS.playbackSource]: playbackSource });
  renderPlaylists();
  showToast("Der Player würfelt wieder nur innerhalb der aktuellen Serie.");
});
document.getElementById("enable-visible").addEventListener("click", () => setVisibleExcluded(false));
document.getElementById("disable-visible").addEventListener("click", () => setVisibleExcluded(true));
document.getElementById("reset-catalog").addEventListener("click", () => document.getElementById("reset-dialog").showModal());
document.getElementById("reset-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue === "confirm") resetCatalog();
});
document.getElementById("playlist-delete-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue === "confirm") deletePendingPlaylist();
  else pendingDeletePlaylistId = null;
});
document.getElementById("start-auto-scan").addEventListener("click", async () => {
  const tabs = await queryDisneyTabs();
  const disneyTab = tabs.find((tab) => tab.url && /disneyplus\.com/i.test(tab.url));
  if (!disneyTab?.url) {
    showToast("Öffne Disney+ einmal, damit der private Abgleich starten kann.");
    return;
  }
  const response = await runtimeSend({ type: "DP_RANDOM_START_AUTOSCAN", url: disneyTab.url });
  if (!response?.ok) showToast(response?.error || "Der Abgleich konnte nicht gestartet werden.");
});
document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    const path = button.dataset.open;
    chrome.tabs.create({ url: `https://www.disneyplus.com/de-de/browse/${path}` });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[KEYS.catalog]) catalog = (changes[KEYS.catalog].newValue || []).map(normalizeItem);
  if (changes[KEYS.facets]) facets = normalizeFacets(changes[KEYS.facets].newValue);
  if (changes[KEYS.filter]) randomFilter = Core.normalizeFilter(changes[KEYS.filter].newValue || DEFAULT_FILTER);
  if (changes[KEYS.blocklist]) blocklist = Array.isArray(changes[KEYS.blocklist].newValue) ? changes[KEYS.blocklist].newValue : [];
  if (changes[KEYS.playlists]) playlists = normalizePlaylists(changes[KEYS.playlists].newValue);
  if (changes[KEYS.playbackSource]) playbackSource = normalizePlaybackSource(changes[KEYS.playbackSource].newValue);
  if (changes[AUTO_SCAN_KEY]) autoScan = changes[AUTO_SCAN_KEY].newValue || null;
  populateViewBrand();
  populateViewCategory();
  renderAutoScan();
  renderPlaylists();
  renderCatalog();
});

document.addEventListener("dp-random:language-changed", () => {
  renderAutoScan();
  renderPlaylists();
  renderCatalog();
});

(async () => {
  await I18n.ready;
  const stored = await storageGet([KEYS.catalog, KEYS.facets, KEYS.filter, KEYS.blocklist, KEYS.playlists, KEYS.playbackSource, AUTO_SCAN_KEY]);
  catalog = (Array.isArray(stored[KEYS.catalog]) ? stored[KEYS.catalog] : []).map(normalizeItem);
  facets = normalizeFacets(stored[KEYS.facets]);
  randomFilter = Core.normalizeFilter(stored[KEYS.filter] || DEFAULT_FILTER);
  blocklist = Array.isArray(stored[KEYS.blocklist]) ? stored[KEYS.blocklist] : [];
  playlists = normalizePlaylists(stored[KEYS.playlists]);
  playbackSource = normalizePlaybackSource(stored[KEYS.playbackSource]);
  autoScan = stored[AUTO_SCAN_KEY] || null;
  populateViewBrand();
  populateViewCategory();
  renderAutoScan();
  renderPlaylists();
  renderCatalog();
})();
