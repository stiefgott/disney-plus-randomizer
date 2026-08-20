(function initDisneyRandomI18n(global) {
  "use strict";

  if (global.DisneyRandomI18n) return;

  const STORAGE_KEY = "dpRandom.language.v1";
  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = Object.freeze({
    en: "English",
    de: "Deutsch"
  });

  // English is the canonical source language. Adding another language only
  // requires another object with the same English keys.
  const TRANSLATIONS = {
    de: {
      "Disney+ Random": "Disney+ Zufall",
      "Help · Disney+ Random": "Hilfe · Disney+ Zufall",
      "Catalog · Disney+ Random": "Katalog · Disney+ Zufall",
      "Language": "Sprache",
      "Help & guide": "Hilfe & Anleitung",
      "Open help and guide": "Hilfe und Anleitung öffnen",
      "Back to top": "Zum Seitenanfang",
      "First launch": "Erster Start",
      "Preparing your catalog": "Katalog wird vorbereitet",
      "An inactive Disney+ tab is loading the catalog. Please wait a moment.": "Ein inaktiver Disney+-Tab lädt den Katalog. Bitte einen Moment Geduld.",
      "Continue in background": "Im Hintergrund fortsetzen",
      "Checking Disney+ …": "Disney+ wird geprüft …",
      "Catalog & filters": "Katalog & Filter",
      "Open local catalog": "Lokalen Katalog öffnen",
      "Random selection": "Zufallsauswahl",
      "Random recommendation": "Zufallsempfehlung",
      "Show one matching title": "Nur einen passenden Titel zeigen",
      "Play filter as series mix": "Filter als Serienmix",
      "Play a random series and episode": "Serie und Folge zufällig abspielen",
      "Random episode": "Zufällige Folge",
      "Let's go": "Los geht’s",
      "Available on a series page": "Auf einer Serienseite verfügbar",
      "Playback settings": "Wiedergabe-Einstellungen",
      "Playback": "Wiedergabe",
      "Start series immediately": "Serie direkt starten",
      "Start playing immediately after selection": "Nach der Auswahl sofort abspielen",
      "Continue with random episodes": "Folgen zufällig fortsetzen",
      "Automatically choose again after every episode": "Nach jeder Folge automatisch neu auswählen",
      "Skip watched episodes": "Gesehene Folgen auslassen",
      "Skip fully watched episodes": "Vollständig abgespielte Folgen überspringen",
      "Private & stored locally only": "Privat & nur lokal gespeichert",
      "Your local catalog": "Dein lokaler Katalog",
      "Choose what Random may select.": "Bestimme, was der Zufall auswählen darf.",
      "Choose what": "Bestimme, was der",
      "Random may select.": "Zufall auswählen darf.",
      "All titles remain exclusively in your browser. Filters control the next random selection; disabled or deleted titles are not used.": "Alle Titel bleiben ausschließlich in deinem Browser. Filter steuern die nächste Zufallsauswahl; deaktivierte oder gelöschte Titel werden dabei nicht verwendet.",
      "Catalog statistics": "Katalogstatistik",
      "Titles": "Titel",
      "enabled": "aktiv",
      "Series": "Serien",
      "Movies": "Filme",
      "Automatic & private": "Automatisch & privat",
      "The current Disney+ catalog is collected automatically": "Der aktuelle Disney+-Katalog wird selbstständig eingelesen",
      "The extension works directly with your signed-in Disney+ in an inactive tab and does not request your location. It does not open, minimize, or refocus additional browser windows. This keeps the selection aligned with the catalog Disney+ currently shows you — even while traveling.": "Die Extension arbeitet in einem inaktiven Tab direkt mit deinem eingeloggten Disney+ und fragt keinen Standort ab. Sie öffnet, minimiert oder fokussiert dafür keine zusätzlichen Browserfenster. So entspricht die Auswahl dem Angebot, das Disney+ dir aktuell zeigt – auch auf Reisen.",
      "Ready for automatic sync": "Bereit für den automatischen Abgleich",
      "Run full sync now": "Jetzt vollständig abgleichen",
      "Active random selection": "Aktive Zufallsauswahl",
      "What may be randomized?": "Was darf gewürfelt werden?",
      "Saved automatically": "Automatisch gespeichert",
      "Catalog": "Katalog",
      "Disney+ title": "Disney+-Titel",
      "Playback takes priority": "Wiedergabe hat Vorrang",
      "Content": "Inhalt",
      "All content": "Alles",
      "Category": "Kategorie",
      "All categories": "Alle Kategorien",
      "Source": "Herkunft",
      "Disney+ & Hulu": "Disney+ & Hulu",
      "Disney+ studio": "Disney+-Studio",
      "Advanced": "Erweitert",
      "All studios": "Alle Studios",
      "currently match this selection.": "passen aktuell zu dieser Auswahl.",
      "Recommend only": "Nur empfehlen",
      "Play random series": "Serien zufällig abspielen",
      "Reset": "Zurücksetzen",
      "Your series mixes": "Deine Serienmixe",
      "Local playlists": "Lokale Playlists",
      "Create your own series groups. When a playlist is active, the player randomly chooses a series and an episode after every episode.": "Stelle eigene Seriengruppen zusammen. Ist eine Playlist aktiv, wählt der Player nach jeder Folge zufällig eine Serie und eine Folge daraus.",
      "Use current series only": "Nur aktuelle Serie verwenden",
      "New playlist": "Neue Playlist",
      "e.g. Animation night": "z. B. Animationsabend",
      "Create playlist": "Playlist erstellen",
      "No playlists yet": "Noch keine Playlist",
      "Create a playlist and add your series from the catalog below.": "Erstelle eine Playlist und füge ihr unten deine Serien hinzu.",
      "Manage": "Verwalten",
      "Your saved titles": "Deine gespeicherten Titel",
      "Reset catalog": "Katalog zurücksetzen",
      "Search titles …": "Titel suchen …",
      "Filter by type": "Nach Typ filtern",
      "All types": "Alle Typen",
      "Series only": "Nur Serien",
      "Movies only": "Nur Filme",
      "Specials only": "Nur Specials",
      "Not assigned yet": "Noch nicht zugeordnet",
      "Filter by status": "Nach Status filtern",
      "Enabled & paused": "Aktiv & pausiert",
      "Enabled only": "Nur aktiv",
      "Paused only": "Nur pausiert",
      "Filter by source": "Nach Herkunft filtern",
      "All sources": "Alle Herkünfte",
      "Filter by category": "Nach Kategorie filtern",
      "Edit playlist": "Playlist bearbeiten",
      "Create a playlist first": "Erst eine Playlist erstellen",
      "Create a playlist first, then add series from the catalog.": "Erstelle zuerst eine Playlist und füge danach Serien aus dem Katalog hinzu.",
      "shown": "angezeigt",
      "Enable visible": "Sichtbare aktivieren",
      "Pause visible": "Sichtbare pausieren",
      "Show more titles": "Weitere Titel anzeigen",
      "Nothing matching here yet": "Noch nichts Passendes hier",
      "Open a Disney+ collection and scroll through the titles.": "Öffne bei Disney+ eine Übersicht und scrolle durch die Titel.",
      "Really reset the catalog?": "Katalog wirklich zurücksetzen?",
      "All detected titles, categories, playlists, exclusions, and random history will be deleted locally. Your playback settings remain unchanged.": "Alle erkannten Titel, Kategorien, Playlists, Sperren und der Zufallsverlauf werden lokal gelöscht. Deine Wiedergabe-Einstellungen bleiben erhalten.",
      "Cancel": "Abbrechen",
      "Reset everything": "Alles zurücksetzen",
      "Delete playlist?": "Playlist löschen?",
      "will only be deleted locally. Series and catalog remain unchanged.": "wird nur lokal gelöscht. Serien und Katalog bleiben unverändert.",
      "” will only be deleted locally. Series and catalog remain unchanged.": "“ wird nur lokal gelöscht. Serien und Katalog bleiben unverändert.",
      "Delete playlist": "Playlist löschen",
      "Guide & help · Version 1.0.0": "Hilfe & Anleitung · Version 1.0.0",
      "Simply explained": "Einfach erklärt",
      "More choice.": "Mehr Auswahl.",
      "Less searching.": "Weniger Suchen.",
      "The extension automatically reads the catalog directly from the Disney+ account currently signed in. This creates your personal random selection — entirely local, without requesting your location and without an external server.": "Die Extension liest den Katalog automatisch direkt aus deinem aktuell eingeloggten Disney+ ein. Daraus entsteht deine persönliche Zufallsauswahl – vollständig lokal, ohne Standortabfrage und ohne externen Server.",
      "Open catalog & filters": "Katalog & Filter öffnen",
      "Open Disney+": "Disney+ öffnen",
      "How titles are loaded": "So werden Titel geladen",
      "Local catalog status": "Lokaler Katalogstand",
      "Content type breakdown": "Aufteilung nach Inhaltstyp",
      "Only on this device": "Nur auf diesem Gerät",
      "What do the catalog numbers mean?": "Was bedeuten die Katalogzahlen?",
      "The large number shows every detected title. Below it you can see how many have already been clearly identified as series or movies. Specials and unassigned content are included only in the total.": "Die große Zahl zeigt alle erkannten Titel. Darunter siehst du, wie viele davon bereits eindeutig als Serien oder Filme zugeordnet wurden. Specials und noch nicht zugeordnete Inhalte sind nur in der Gesamtzahl enthalten.",
      "In four steps": "In vier Schritten",
      "How your current catalog is created": "So entsteht dein aktueller Katalog",
      "You do not need to import, export, or open titles individually. As soon as you open Disney+ while signed in, the extension performs the sync in the background.": "Du musst nichts importieren, exportieren oder einzeln öffnen. Sobald Disney+ angemeldet geöffnet ist, erledigt die Extension den Abgleich im Hintergrund.",
      "A normal visit to Disney+ while signed in is enough to start the process.": "Ein normaler Besuch bei deinem eingeloggten Disney+ genügt als Startsignal.",
      "Sync automatically": "Automatisch abgleichen",
      "Series, movies, Originals, Disney+, Hulu, and the available studio pages are visited automatically in an inactive background tab.": "Serien, Filme, Originals, Disney+, Hulu und die angebotenen Studioseiten werden in einem inaktiven Hintergrund-Tab selbstständig durchlaufen.",
      "Current catalog": "Aktuelles Angebot",
      "The only source is the catalog Disney+ currently shows you — without GPS or location services.": "Quelle ist nur das Disney+, das dir gerade Inhalte zeigt – ohne GPS oder Standortdienst.",
      "Keep watching right away": "Sofort weitersehen",
      "The finished catalog remains local. A successful full scan is repeated automatically no sooner than twelve hours later; you can start it manually at any time with “Run full sync now”.": "Der fertige Katalog bleibt lokal. Ein erfolgreicher Vollscan wird frühestens nach zwölf Stunden automatisch wiederholt; über „Jetzt vollständig abgleichen“ kannst du ihn jederzeit manuell starten.",
      "Private:": "Privat:",
      "There is no location request and no external catalog server. While traveling, only the catalog delivered by your current Disney+ session is used.": "Es gibt keine Standortabfrage und keinen externen Katalogserver. Bei Reisen zählt ausschließlich das Angebot, das dein aktuelles Disney+ selbst ausliefert.",
      "All features": "Alle Funktionen",
      "What does each button do?": "Was macht welcher Knopf?",
      "Opens only the detail page of a title matching your filter. Nothing starts playing yet.": "Öffnet nur die Detailseite eines Titels, der zu deinem Filter passt. Es wird dabei noch nichts abgespielt.",
      "Filters by series, movies, Originals, category, Disney+/Hulu, and optionally Disney+ studio. Titles can be paused or deleted.": "Filtert nach Serien, Filmen, Originals, Kategorie, Disney+/Hulu und optional Disney+-Studio. Titel lassen sich pausieren oder löschen.",
      "Selects a random series and episode from matching series. With a movie filter, a random movie starts instead. For series, the filter remains the source for subsequent random episodes.": "Wählt unter den passenden Serien direkt eine zufällige Serie und Folge. Bei einem Filmfilter wird stattdessen ein zufälliger Film gestartet. Für Serien bleibt der Filter die Quelle weiterer Zufallsfolgen.",
      "Combine shows such as Family Guy, American Dad, and The Simpsons into your own mix. Playlists remain only in your browser.": "Fasse etwa Family Guy, American Dad und Die Simpsons zu einem eigenen Mix zusammen. Playlists bleiben nur in deinem Browser.",
      "Available on a series page. The extension first chooses a season and then an episode.": "Ist auf einer Serienseite verfügbar. Die Extension wählt zuerst eine Staffel und danach eine Folge.",
      "The shuffle button in the player turns the mode on or off. When active, it uses the current series, selected filter, or active playlist. Cyan means active.": "Der Shuffle-Knopf im Player schaltet den Modus an oder aus. Aktiv verwendet er die aktuelle Serie, den gewählten Filter oder die aktive Playlist. Türkis bedeutet: aktiv.",
      "Attempts to open the next episode offered by Disney+ immediately after selecting a series.": "Versucht nach der Serienauswahl direkt die von Disney+ angebotene nächste Folge zu öffnen.",
      "Skips episodes that Disney+ already marks as fully watched on the series page.": "Überspringt Folgen, die Disney+ auf der Serienseite bereits als vollständig angesehen markiert.",
      "Quick answers": "Kurz beantwortet",
      "If something is unclear": "Wenn etwas unklar ist",
      "Why does the first full sync take several minutes?": "Warum dauert der erste vollständige Abgleich einige Minuten?",
      "Disney+ loads its catalog dynamically and gradually. The extension visits the sections automatically but does not use a secret or external interface. To reduce browser load, the catalog is saved only at the end of each section, and a successful full scan is repeated automatically at most once every twelve hours.": "Disney+ lädt seinen Katalog dynamisch und nach und nach. Die Extension durchläuft die Bereiche automatisch, verwendet aber keine geheime oder externe Schnittstelle. Um den Browser zu schonen, wird der Katalog nur am Ende jedes Bereichs gespeichert und ein erfolgreicher Vollscan höchstens alle zwölf Stunden automatisch wiederholt.",
      "What happens if I start a video during the sync?": "Was passiert, wenn ich während des Abgleichs ein Video starte?",
      "Playback takes priority. The extension automatically closes the scan tab so it does not compete with the player for resources. You can restart the full sync later from the catalog page.": "Die Wiedergabe hat Vorrang. Die Extension schließt den Scan-Tab automatisch, damit er dem Player keine Leistung wegnimmt. Den vollständigen Abgleich kannst du später auf der Katalogseite erneut starten.",
      "How do category and studio filters work?": "Wie funktionieren Kategorie- und Studiofilter?",
      "During a full sync, the extension automatically opens the currently available studio pages and assigns their titles. Disney+ studios then appear as an advanced selection under the Disney+ source filter.": "Beim vollständigen Abgleich öffnet die Extension automatisch die aktuell angebotenen Studioseiten und ordnet deren Titel zu. Disney+-Studios erscheinen anschließend als erweiterte Auswahl unter dem Herkunftsfilter Disney+.",
      "Why is “Random episode” sometimes disabled?": "Warum ist „Zufällige Folge“ manchmal ausgegraut?",
      "This feature needs the episode list of a specific series. Open the detail page of the desired series first; the button becomes available there.": "Diese Funktion braucht die Folgenliste einer konkreten Serie. Öffne zuerst die Detailseite der gewünschten Serie; dort wird der Knopf aktiv.",
      "How do I create a mix of selected series?": "Wie erstelle ich einen Mix aus bestimmten Serien?",
      "Open “Catalog & filters”, create a playlist under “Local playlists”, and select it for editing. Then find your series in the catalog and add them using the list button. “Activate & play” starts the mix.": "Öffne „Katalog & Filter“, erstelle unter „Lokale Playlists“ eine Playlist und wähle sie zum Bearbeiten aus. Suche anschließend deine Serien im Katalog und füge sie mit dem Listenknopf hinzu. „Aktivieren & abspielen“ startet den Mix.",
      "What does the shuffle button in the player control?": "Was steuert der Shuffle-Knopf im Player?",
      "It turns continuous random playback on or off. The last selected source remains saved: either the current series, your active filter, or a playlist. The button tooltip shows the active source.": "Er schaltet die fortlaufende Zufallswiedergabe an oder aus. Die zuletzt gewählte Quelle bleibt gespeichert: entweder die aktuelle Serie, dein aktiver Filter oder eine Playlist. Der Hover-Text am Knopf zeigt die aktive Quelle.",
      "Where are my titles and settings stored?": "Wo werden meine Titel und Einstellungen gespeichert?",
      "Exclusively in your browser's local extension storage. The extension has no analytics, advertising, telemetry, or external servers.": "Ausschließlich im lokalen Extension-Speicher deines Browsers. Die Extension besitzt keine Analyse, Werbung, Telemetrie oder externen Server.",
      "What should I do after an extension update?": "Was mache ich nach einem Extension-Update?",
      "Reload the extension on the browser's extension page, then fully reload the Disney+ tab that is already open.": "Lade die Extension auf der Erweiterungsseite neu und aktualisiere danach den bereits geöffneten Disney+-Tab einmal vollständig.",
      "Private stays private.": "Privat bleibt privat.",
      "No account data, history, or detected titles leave your browser. The extension changes neither DRM nor your Disney+ account.": "Keine Kontodaten, kein Verlauf und keine erkannten Titel verlassen deinen Browser. Die Extension verändert weder DRM noch dein Disney+-Konto.",
      "No ads": "Keine Werbung",
      "No analytics": "Keine Analyse",
      "No cloud": "Keine Cloud",
      "Disney+ Random · Version 1.0.0": "Disney+ Zufall · Version 1.0.0",
      "Private browser extension not affiliated with Disney": "Private, nicht mit Disney verbundene Browser-Extension",
      "Open Disney+ once so the selection can start.": "Öffne Disney+ einmal, damit die Auswahl gestartet werden kann.",
      "The Disney+ tab needs to be reloaded once after the extension update.": "Der Disney+-Tab muss nach dem Extension-Update einmal neu geladen werden.",
      "Sync running …": "Abgleich läuft …",
      "Run full sync again": "Erneut vollständig abgleichen",
      "Sync paused · video playback took priority": "Abgleich pausiert · deine Videowiedergabe hatte Vorrang",
      "Sync stopped · please sign in to Disney+ completely first": "Abgleich gestoppt · bitte zuerst vollständig bei Disney+ anmelden",
      "Continue sync later": "Abgleich später fortsetzen",
      "Try again after signing in": "Nach der Anmeldung erneut versuchen",
      "Starts automatically on the first Disney+ visit of each browser session": "Startet beim ersten Disney+-Besuch jeder Browsersitzung automatisch",
      "Saving …": "Wird gespeichert …",
      "Movie": "Film",
      "Special": "Special",
      "Unassigned": "Offen",
      "Select playlist": "Playlist auswählen",
      "Active playback source": "Aktive Wiedergabequelle",
      "Local series playlist": "Lokale Serien-Playlist",
      "No series added yet.": "Noch keine Serien hinzugefügt.",
      "Active · Play now": "Aktiv · Jetzt abspielen",
      "Activate & play": "Aktivieren & abspielen",
      "Editing": "Wird bearbeitet",
      "Edit": "Bearbeiten",
      "Delete": "Löschen",
      "Open on Disney+": "Bei Disney+ öffnen",
      "Enable for random selection": "Für Zufall aktivieren",
      "Pause for random selection": "Für Zufall pausieren",
      "Delete from catalog": "Aus Katalog löschen",
      "Only series can be added to a series playlist": "Nur Serien können einer Serien-Playlist hinzugefügt werden",
      "Create or select a playlist first": "Erst eine Playlist erstellen oder auswählen",
      "Create or select a playlist first.": "Erstelle oder wähle zuerst eine Playlist.",
      "are currently available for any random selection.": "stehen aktuell für jede Zufallsauswahl bereit.",
      "Series added to playlist.": "Serie zur Playlist hinzugefügt.",
      "Series removed from playlist.": "Serie aus Playlist entfernt.",
      "Adjust the search or view filters to see titles again.": "Passe Suche oder Ansichtsfilter an, um wieder Titel zu sehen.",
      "Open a Disney+ collection or category and scroll through the titles.": "Öffne bei Disney+ eine Übersicht oder Kategorie und scrolle durch die Titel.",
      "Title paused for random selection.": "Titel für Zufall pausiert.",
      "Title enabled again.": "Titel wieder aktiviert.",
      "Visible titles paused.": "Sichtbare Titel pausiert.",
      "Visible titles enabled.": "Sichtbare Titel aktiviert.",
      "The local catalog has been reset.": "Der lokale Katalog wurde zurückgesetzt.",
      "Random filter reset.": "Zufallsfilter zurückgesetzt.",
      "The player will now randomize only within the current series again.": "Der Player würfelt wieder nur innerhalb der aktuellen Serie.",
      "Open Disney+ once so the private sync can start.": "Öffne Disney+ einmal, damit der private Abgleich starten kann.",
      "The sync could not be started.": "Der Abgleich konnte nicht gestartet werden.",
      "No valid Disney+ address": "Keine gültige Disney+-Adresse",
      "Could not open an inactive scan tab": "Inaktiver Scan-Tab konnte nicht geöffnet werden",
      "Open the matching Disney+ collection …": "Ich öffne die passende Disney+-Übersicht …",
      "There are no enabled titles for this filter. Check your catalog.": "Für diesen Filter sind keine aktivierten Titel vorhanden. Prüfe deinen Katalog.",
      "This playlist does not contain any available series yet.": "Diese Playlist enthält noch keine verfügbaren Serien.",
      "No series have been detected for this filter yet. Please sync the catalog again.": "Unter diesem Filter wurden noch keine Serien erkannt. Bitte den Katalog erneut abgleichen.",
      "Open a series detail page first.": "Öffne zuerst die Detailseite einer Serie.",
      "No episodes have been found on this page yet.": "Auf dieser Seite wurden noch keine Folgen gefunden.",
      "Play a random episode directly": "Zufällige Folge direkt abspielen",
      "This series could not be detected automatically yet. Catalog sync is running in the background.": "Die Serie konnte noch nicht automatisch erkannt werden. Der Katalogabgleich läuft im Hintergrund.",
      "Random playback is off.": "Zufallswiedergabe ist aus.",
      "Random playback is on: After this episode, a new one will be selected from the current series.": "Zufallswiedergabe ist an: Nach dieser Folge wird aus der aktuellen Serie neu ausgewählt.",
      "Random playback is on. The current series will be detected automatically.": "Zufallswiedergabe ist an. Die aktuelle Serie wird automatisch ermittelt.",
      "Series opened — Disney+ still requires a click on Play here.": "Serie geöffnet – Disney+ verlangt hier noch einen Klick auf Abspielen.",
      "The series page did not load in time. Please randomize once manually.": "Die Serienseite wurde nicht rechtzeitig geladen. Bitte würfle einmal manuell.",
      "The selected series page did not load in time.": "Die ausgewählte Serienseite wurde nicht rechtzeitig geladen.",
      "No matching cards found yet. Scroll through the collection briefly and try again.": "Noch keine passenden Karten gefunden. Scrolle kurz durch die Übersicht und probiere es erneut.",
      "No title cards found": "Keine Titelkarten gefunden",
      "Categories could not be loaded": "Kategorien konnten nicht geladen werden",
      "The Disney+ catalog is being prepared briefly in the background. Please wait a moment.": "Disney+-Katalog wird kurz im Hintergrund vorbereitet. Bitte einen Moment Geduld.",
      "Disney+ Random selection": "Disney+ Zufallsauswahl",
      "Play series mix": "Serienmix abspielen",
      "Play selected series immediately": "Ausgewählte Serie direkt abspielen",
      "Tip: Automatic sync collects series, movies, Originals, and specials in your local catalog.": "Tipp: Der automatische Abgleich sammelt Serien, Filme, Originals und Specials in deinem lokalen Katalog.",
      "Open Disney+ Random": "Disney+ Zufall öffnen",
      "Available only on a series detail page": "Nur auf einer Serien-Detailseite verfügbar",
      "Choose a random season and episode": "Staffel und Folge zufällig wählen",
      "Choose a season and episode directly": "Staffel und Folge direkt auswählen",
      "Open disneyplus.com first": "Öffne zuerst disneyplus.com",
      "Catalog is ready": "Katalog ist bereit",
      "Studios & Continue Watching": "Studios & Weiterschauen",
      "An inactive Disney+ tab": "Ein inaktiver Disney+-Tab",
      "Automatic catalog sync is running …": "Automatischer Katalogabgleich läuft …",
      "all filters open": "alle Filter offen",
      "Movie recommendation": "Filmempfehlung",
      "Series recommendation": "Serienempfehlung",
      "Original recommendation": "Original-Empfehlung",
      "open details only": "nur Details öffnen",
      "Play playlist randomly": "Playlist zufällig abspielen",
      "Play a random movie": "Zufälligen Film abspielen",
      "start immediately": "direkt starten",
      "randomize series and episode": "Serie und Folge würfeln",
      "Next selection from the active filter": "Nächste Auswahl aus dem aktiven Filter",
      "Next selection from the current series": "Nächste Auswahl aus der aktuellen Serie",
      "ON": "AN",
      "OFF": "AUS",
      "Random": "Zufall",
      "Random: ON": "Zufall: AN",
      "Random: OFF": "Zufall: AUS",
      "Guide": "Anleitung",
      "⌘/Ctrl": "⌘/Strg",
      "current series": "aktuelle Serie",
      "active filter": "aktiver Filter",
      "Playlist": "Playlist"
    }
  };

  const textRecords = new WeakMap();
  const attributeRecords = new WeakMap();
  const observedRoots = new WeakSet();
  const germanAliases = new Map(
    Object.entries(TRANSLATIONS.de).map(([english, german]) => [german, english])
  );
  // A few German nouns have the same singular and plural English spelling.
  germanAliases.set("Serien", "Series");
  germanAliases.set("Serie", "Series");
  let language = DEFAULT_LANGUAGE;

  const dynamicGermanRules = [
    [/^(\d+) Titel · (\d+) Serien · (\d+) Filme$/, "$1 titles · $2 series · $3 movies"],
    [/^(\d+) Titel bisher\. (.+) arbeitet im Hintergrund\.$/, (_match, count, surface) => `${count} titles so far. ${germanAliases.get(surface) || surface} is working in the background.`],
    [/^(\d+) Titel wurden lokal vorbereitet\.$/, "$1 titles were prepared locally."],
    [/^(.*) werden geladen$/, (_match, section) => `Loading ${germanAliases.get(section) || section}`],
    [/^(.*) wird eingelesen · (\d+) Titel bisher · das kann einige Minuten dauern$/, (_match, section, count) => `Scanning ${germanAliases.get(section) || section} · ${count} titles so far · this may take a few minutes`],
    [/^(\d+) aktuelle Titel · zuletzt um (.+) abgeglichen$/, "$1 current titles · last synced at $2"],
    [/^Abgleich um (.+) unvollständig · wird in der nächsten Sitzung erneut versucht$/, "Sync at $1 was incomplete · it will be retried next session"],
    [/^(\d+) Titel$/, "$1 titles"],
    [/^(\d+) passend · nur Details öffnen$/, "$1 matching · open details only"],
    [/^(\d+) Titel · nur Details öffnen$/, "$1 titles · open details only"],
    [/^(\d+) aktiv(?: · (.+))?$/, (_match, count, filters) => `${count} enabled${filters ? ` · ${filters.replace(/^alle Filter offen$/, "all filters open")}` : ""}`],
    [/^(\d+) Serien · Serie und Folge würfeln$/, "$1 series · randomize series and episode"],
    [/^(\d+) Serie · Serie und Folge würfeln$/, "$1 series · randomize series and episode"],
    [/^(\d+) Filme · direkt starten$/, "$1 movies · start immediately"],
    [/^(\d+) Film · direkt starten$/, "$1 movie · start immediately"],
    [/^(\d+) Filme zufällig abspielen$/, "Play $1 random movies"],
    [/^(\d+) Serien zufällig abspielen$/, "Play $1 random series"],
    [/^1 Film zufällig abspielen$/, "Play 1 random movie"],
    [/^1 Serie zufällig abspielen$/, "Play 1 random series"],
    [/^(\d+) (Serie|Serien) enthalten · Mit dem Listenknopf an den Serien ändern\.$/, "$1 series included · Use the list button on a series to change this."],
    [/^(\d+) Serien$/, "$1 series"],
    [/^(.+) · (\d+) (Serie|Serien)$/, "$1 · $2 series"],
    [/^Weitere (\d+) Titel anzeigen$/, "Show $1 more titles"],
    [/^Playlist „(.+)“ wird gestartet …$/, "Starting playlist “$1” …"],
    [/^Playlist „(.+)“ erstellt\.$/, "Playlist “$1” created."],
    [/^Playlist „(.+)“ gelöscht\.$/, "Playlist “$1” deleted."],
    [/^Aus „(.+)“ entfernen$/, "Remove from “$1”"],
    [/^Zu „(.+)“ hinzufügen$/, "Add to “$1”"],
    [/^(.+) löschen$/, "Delete $1"],
    [/^(.+) wurde gelöscht\.$/, "$1 was deleted."],
    [/^Zufall: (.+)$/, "Random: $1"],
    [/^Zufallsfolge: (.+)$/, "Random episode: $1"],
    [/^Zufallswiedergabe ist an: Nächste Auswahl aus (.+)\.$/, "Random playback is on: Next selection from $1."],
    [/^Nächste Auswahl aus „(.+)“$/, "Next selection from “$1”"],
    [/^Playlist „(.+)“$/, "Playlist “$1”"],
    [/^Playlist „(.+)“ abspielen$/, "Play playlist “$1”"],
    [/^Zufallswiedergabe (einschalten|ausschalten)$/, (_match, action) => action === "einschalten" ? "Turn random playback on" : "Turn random playback off"],
    [/^Zufallswiedergabe: (AN|AUS)$/, (_match, state) => `Random playback: ${state === "AN" ? "ON" : "OFF"}`]
  ];

  function normalizeLanguage(value) {
    return Object.hasOwn(SUPPORTED_LANGUAGES, value) ? value : DEFAULT_LANGUAGE;
  }

  function replaceKeepingWhitespace(value, replacement) {
    const leading = value.match(/^\s*/)?.[0] || "";
    const trailing = value.match(/\s*$/)?.[0] || "";
    return `${leading}${replacement}${trailing}`;
  }

  function canonicalText(value) {
    const text = String(value ?? "").trim();
    if (!text) return text;
    if (germanAliases.has(text)) return germanAliases.get(text);
    for (const [pattern, replacement] of dynamicGermanRules) {
      if (!pattern.test(text)) continue;
      pattern.lastIndex = 0;
      return typeof replacement === "function" ? text.replace(pattern, replacement) : text.replace(pattern, replacement);
    }
    return text;
  }

  function translate(value, targetLanguage = language) {
    const raw = String(value ?? "");
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const canonical = canonicalText(trimmed);
    const translated = targetLanguage === "en"
      ? canonical
      : targetLanguage === "de" && germanAliases.has(trimmed)
        ? trimmed
        : TRANSLATIONS[targetLanguage]?.[canonical] || canonical;
    return replaceKeepingWhitespace(raw, translated);
  }

  function translateTextNode(node) {
    const current = node.nodeValue || "";
    let record = textRecords.get(node);
    if (!record || current !== record.rendered) record = { source: current, rendered: current };
    const rendered = translate(record.source);
    record.rendered = rendered;
    textRecords.set(node, record);
    if (current !== rendered) node.nodeValue = rendered;
  }

  function translateAttribute(element, name) {
    const current = element.getAttribute(name);
    if (current == null) return;
    let records = attributeRecords.get(element);
    if (!records) {
      records = new Map();
      attributeRecords.set(element, records);
    }
    let record = records.get(name);
    if (!record || current !== record.rendered) record = { source: current, rendered: current };
    const rendered = translate(record.source);
    record.rendered = rendered;
    records.set(name, record);
    if (current !== rendered) element.setAttribute(name, rendered);
  }

  function translateTree(root) {
    if (!root) return;
    const documentRef = root.ownerDocument || (root.nodeType === 9 ? root : document);
    const walker = documentRef.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|NOSCRIPT)$/i.test(parent.tagName) || parent.closest('[translate="no"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateTextNode);
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
    for (const element of elements) {
      if (element.closest('[translate="no"]')) continue;
      for (const name of ["title", "aria-label", "placeholder"]) {
        if (element.hasAttribute(name)) translateAttribute(element, name);
      }
    }
  }

  function observe(root) {
    if (!root || observedRoots.has(root)) {
      if (root) translateTree(root);
      return;
    }
    observedRoots.add(root);
    translateTree(root);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTextNode(mutation.target);
        if (mutation.type === "attributes") translateAttribute(mutation.target, mutation.attributeName);
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateTree(node);
        }
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder"]
    });
  }

  function storageGet() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(STORAGE_KEY, (result) => resolve(result?.[STORAGE_KEY]));
      } catch (_error) {
        resolve(DEFAULT_LANGUAGE);
      }
    });
  }

  function storageSet(nextLanguage) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: nextLanguage }, resolve);
      } catch (_error) {
        resolve();
      }
    });
  }

  function applyLanguage(nextLanguage) {
    language = normalizeLanguage(nextLanguage);
    if (typeof document !== "undefined") {
      // Do not overwrite Disney+'s own document language. Only extension pages
      // and our isolated overlay should reflect the extension preference.
      if (isExtensionPage) document.documentElement.lang = language;
      document.getElementById("dp-random-root")?.setAttribute("lang", language);
      for (const root of [document.documentElement, ...document.querySelectorAll("#dp-random-root")]) {
        if (observedRoots.has(root)) translateTree(root);
      }
      document.dispatchEvent(new CustomEvent("dp-random:language-changed", { detail: { language } }));
    }
  }

  async function setLanguage(nextLanguage) {
    const normalized = normalizeLanguage(nextLanguage);
    await storageSet(normalized);
    applyLanguage(normalized);
    return normalized;
  }

  const isExtensionPage = typeof location !== "undefined" && !/^https?:$/i.test(location.protocol);
  if (isExtensionPage && typeof document !== "undefined") {
    document.documentElement.dataset.dpI18nLoading = "true";
    const loadingStyle = document.createElement("style");
    loadingStyle.textContent = "html[data-dp-i18n-loading] body{visibility:hidden}";
    document.head?.append(loadingStyle);
  }

  const ready = (async () => {
    applyLanguage(await storageGet());
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
      }
      if (isExtensionPage) observe(document.documentElement);
      delete document.documentElement.dataset.dpI18nLoading;
    }
    return language;
  })();

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[STORAGE_KEY]) applyLanguage(changes[STORAGE_KEY].newValue);
    });
  } catch (_error) {
    // The extension context may have been reloaded while a Disney+ tab stayed open.
  }

  global.DisneyRandomI18n = Object.freeze({
    DEFAULT_LANGUAGE,
    STORAGE_KEY,
    SUPPORTED_LANGUAGES,
    get language() { return language; },
    observe,
    ready,
    setLanguage,
    t: translate,
    translateTree
  });
})(globalThis);
