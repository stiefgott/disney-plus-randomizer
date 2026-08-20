(function initDisneyRandomPlayerMain() {
  "use strict";

  if (window.__DISNEY_RANDOM_PLAYER_MAIN__) return;
  window.__DISNEY_RANDOM_PLAYER_MAIN__ = true;

  const CONTROL_ID = "dp-random-player-control";
  const STYLE_ATTRIBUTE = "data-dp-random-player-style";
  const STATE_EVENT = "dp-random:shuffle-state";
  const TOGGLE_REQUEST_EVENT = "dp-random:toggle-request";
  const SHUFFLE_ICON = `
    <svg fill="none" aria-hidden="true" viewBox="0 0 28 28">
      <path d="M3 7h3.2c2.75 0 4.45 1.25 5.95 3.65l3.75 6c1.25 2 2.7 3.35 5.1 3.35h3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m20.5 16.5 3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M3 20h3.2c2.75 0 4.45-1.25 5.95-3.65l3.75-6C17.15 8.35 18.6 7 21 7h3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20.5 3.5 24 7l-3.5 3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  let active = false;
  let sourceLabel = "";
  let onLabel = "Random: ON";
  let offLabel = "Random: OFF";
  let pointerStartedInside = false;
  let playingBeforePointer = [];
  let lastToggleAt = 0;

  function isPlayerPage() {
    return /\/play(?:\/|$)/i.test(location.pathname);
  }

  function playerParts() {
    const overlay = document.querySelector("main-app-controls-overlay");
    const root = overlay?.shadowRoot || null;
    const controls = root?.querySelector(".experience-controls") || null;
    return { root, controls };
  }

  function currentControl() {
    return playerParts().controls?.querySelector(`#${CONTROL_ID}`) || null;
  }

  function label() {
    return active && sourceLabel ? `${onLabel} · ${sourceLabel}` : (active ? onLabel : offLabel);
  }

  function updateControl() {
    const control = currentControl();
    if (!control) return;
    const nextLabel = label();
    control.classList.toggle("active", active);
    control.setAttribute("aria-label", nextLabel);
    control.setAttribute("aria-pressed", String(active));
    control.title = nextLabel;
    const tooltip = control.querySelector(".dp-random-player-tooltip");
    if (tooltip) tooltip.textContent = nextLabel;
  }

  function ensureStyles(root) {
    if (root.querySelector(`style[${STYLE_ATTRIBUTE}]`)) return;
    const style = document.createElement("style");
    style.setAttribute(STYLE_ATTRIBUTE, "");
    style.textContent = `
      #${CONTROL_ID} {
        align-items: center;
        background: transparent;
        color: #fff;
        cursor: pointer;
        display: flex;
        flex: 0 0 32px;
        height: 32px;
        justify-content: center;
        outline: none;
        pointer-events: auto;
        position: relative;
        width: 32px;
      }
      #${CONTROL_ID}:hover { filter: brightness(0.82); }
      #${CONTROL_ID}:focus-visible {
        border-radius: 3px;
        outline: 2px solid #fff;
        outline-offset: 3px;
      }
      #${CONTROL_ID}.active { color: #55e4f7; }
      #${CONTROL_ID} svg {
        display: block;
        height: 32px;
        pointer-events: none;
        width: 32px;
      }
      #${CONTROL_ID} .dp-random-player-tooltip {
        background: #050505;
        border-radius: 2px;
        bottom: calc(100% + 13px);
        color: #fff;
        filter: none;
        font-family: Avenir, "Avenir Next", Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        left: 50%;
        letter-spacing: 0.08em;
        line-height: 1;
        opacity: 0;
        padding: 8px 9px;
        pointer-events: none;
        position: absolute;
        text-transform: uppercase;
        transform: translateX(-50%) translateY(2px);
        transition: opacity 90ms ease, transform 90ms ease;
        visibility: hidden;
        white-space: nowrap;
        z-index: 2147483647;
      }
      #${CONTROL_ID} .dp-random-player-tooltip::after {
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #050505;
        content: "";
        left: 50%;
        position: absolute;
        top: 100%;
        transform: translateX(-50%);
      }
      #${CONTROL_ID}:hover .dp-random-player-tooltip,
      #${CONTROL_ID}:focus-visible .dp-random-player-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        visibility: visible;
      }
    `;
    root.appendChild(style);
  }

  function ensureControl() {
    if (!isPlayerPage()) return;
    const { root, controls } = playerParts();
    if (!root || !controls) return;
    ensureStyles(root);

    let control = controls.querySelector(`#${CONTROL_ID}`);
    if (control?.dataset.dpMainControl !== "true") {
      control?.remove();
      control = null;
    }

    if (!control) {
      control = document.createElement("div");
      control.id = CONTROL_ID;
      control.dataset.dpMainControl = "true";
      control.setAttribute("role", "button");
      control.setAttribute("tabindex", "0");
      control.innerHTML = `${SHUFFLE_ICON}<span class="dp-random-player-tooltip" role="tooltip"></span>`;
      control.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        blockPlayerEvent(event);
        requestToggle();
      }, true);
      const settings = controls.querySelector("settings-modal-control");
      controls.insertBefore(control, settings || null);
    }
    updateControl();
  }

  function eventHitsControl(event) {
    const control = currentControl();
    if (!control) return false;
    if (event.composedPath?.().includes(control)) return true;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
    const rect = control.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  function blockPlayerEvent(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function allVideos(root = document, found = new Set()) {
    if (!root?.querySelectorAll) return [...found];
    for (const video of root.querySelectorAll("video")) found.add(video);
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) allVideos(element.shadowRoot, found);
    }
    return [...found];
  }

  function resumeVideos(videos) {
    if (!videos.length) return;
    const resume = () => {
      for (const video of videos) {
        if (video.isConnected && video.paused && !video.ended) {
          video.play().catch(() => undefined);
        }
      }
    };
    requestAnimationFrame(resume);
    setTimeout(resume, 80);
    setTimeout(resume, 260);
  }

  function requestToggle() {
    const now = performance.now();
    if (now - lastToggleAt < 250) return;
    lastToggleAt = now;
    active = !active;
    updateControl();
    document.dispatchEvent(new CustomEvent(TOGGLE_REQUEST_EVENT, {
      detail: { enabled: active }
    }));
  }

  // These listeners are registered at document_start in the page's MAIN world,
  // before Disney+'s player listeners. Coordinate checking also works across the
  // player's open shadow roots, where normal content-script targeting can fail.
  window.addEventListener("pointerdown", (event) => {
    if (!eventHitsControl(event)) return;
    pointerStartedInside = true;
    playingBeforePointer = allVideos().filter((video) => !video.paused && !video.ended);
    blockPlayerEvent(event);
  }, { capture: true, passive: false });

  window.addEventListener("pointerup", (event) => {
    if (!pointerStartedInside && !eventHitsControl(event)) return;
    const shouldToggle = pointerStartedInside && eventHitsControl(event);
    pointerStartedInside = false;
    blockPlayerEvent(event);
    if (shouldToggle) requestToggle();
    resumeVideos(playingBeforePointer);
    playingBeforePointer = [];
  }, { capture: true, passive: false });

  window.addEventListener("pointercancel", (event) => {
    if (!pointerStartedInside) return;
    pointerStartedInside = false;
    playingBeforePointer = [];
    blockPlayerEvent(event);
  }, { capture: true, passive: false });

  window.addEventListener("click", (event) => {
    if (!eventHitsControl(event)) return;
    blockPlayerEvent(event);
    // Keyboard/synthetic clicks may not have emitted pointer events.
    if (performance.now() - lastToggleAt >= 250) requestToggle();
  }, { capture: true, passive: false });

  for (const eventName of ["mousedown", "mouseup", "dblclick", "contextmenu"]) {
    window.addEventListener(eventName, (event) => {
      if (eventHitsControl(event)) blockPlayerEvent(event);
    }, { capture: true, passive: false });
  }

  document.addEventListener(STATE_EVENT, (event) => {
    if (typeof event.detail?.active !== "boolean") return;
    active = event.detail.active;
    sourceLabel = String(event.detail?.sourceLabel || "");
    onLabel = String(event.detail?.onLabel || "Random: ON");
    offLabel = String(event.detail?.offLabel || "Random: OFF");
    updateControl();
  });

  setInterval(ensureControl, 600);
  ensureControl();
})();
