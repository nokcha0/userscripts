// ==UserScript==
// @name         MyCourses Lecture Recordings Captions Lock
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-lecture-recordings-captions-lock.user.js
// @downloadURL  https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-lecture-recordings-captions-lock.user.js
// @match        https://mycourses2.mcgill.ca/d2l/lp/*
// @match        https://lrs.mcgill.ca/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const CFG = {
    rowsFromTop: 1.0, // Lower num -> Positioned higher
    defaultLocked: true,
    settleMs: 900,
  };

  const KEY = "__tm_caption_scroll_locked__";
  const BTN_ID = "__tm_caption_lock_btn__";
  const INSTALL_KEY = "__tm_caption_patch_installed__";
  const OBS_KEY = "__tm_caption_class_observer__";

  function getLocked(win = window) {
    try {
      const raw = win.localStorage.getItem(KEY);
      return raw == null ? CFG.defaultLocked : raw === "1";
    } catch {
      return CFG.defaultLocked;
    }
  }

  function setLocked(value, win = window) {
    try {
      win.localStorage.setItem(KEY, value ? "1" : "0");
    } catch {}
    updateButton(win.document);
    if (value) stabilize(win, CFG.settleMs);
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function currentActiveCaption(doc = document) {
    const direct = doc.querySelector('.activecaptionoutline[id^="caption-"]');
    if (direct) return direct;

    const wrap = doc.querySelector(".activecaptionoutline");
    if (!wrap) return null;

    if (typeof wrap.id === "string" && wrap.id.startsWith("caption-"))
      return wrap;
    return wrap.querySelector('[id^="caption-"]');
  }

  function findScrollContainer(el) {
    let p = el.parentElement;
    while (p) {
      const style = getComputedStyle(p);
      if (
        /(auto|scroll|overlay)/.test(style.overflowY) &&
        p.scrollHeight > p.clientHeight + 8
      ) {
        return p;
      }
      p = p.parentElement;
    }
    return (
      document.querySelector(".items_transcript") ||
      document.querySelector(".v-navigation-drawer__content") ||
      null
    );
  }

  function visibleCaptionEls(container) {
    return [...container.querySelectorAll('[id^="caption-"]')].filter(
      isVisible,
    );
  }

  function estimateCaptionGap(active, container) {
    const items = visibleCaptionEls(container);
    const idx = items.indexOf(active);

    if (idx !== -1) {
      const ar = active.getBoundingClientRect();
      const diffs = [];

      for (const j of [idx - 1, idx + 1, idx - 2, idx + 2]) {
        if (j < 0 || j >= items.length) continue;
        const rr = items[j].getBoundingClientRect();
        const diff = Math.abs(rr.top - ar.top);
        if (diff > 6) diffs.push(diff);
      }

      if (diffs.length) return Math.min(...diffs);
    }

    return Math.max(active.getBoundingClientRect().height + 10, 42);
  }

  function moveCaptionHigher(el) {
    const container = findScrollContainer(el);
    if (!container) return;

    const cr = container.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const topInside = container.scrollTop + (er.top - cr.top);
    const gap = estimateCaptionGap(el, container);
    const targetTop = Math.max(0, topInside - gap * CFG.rowsFromTop);

    if (Math.abs(container.scrollTop - targetTop) > 0.5) {
      container.scrollTop = targetTop;
    }
  }

  const settleHandles = new WeakMap();

  function stabilize(win, ms) {
    const old = settleHandles.get(win);
    if (old) win.cancelAnimationFrame(old);

    const end = win.performance.now() + ms;

    function tick() {
      if (!getLocked(win)) return;
      const el = currentActiveCaption(win.document);
      if (el) moveCaptionHigher(el);
      if (win.performance.now() < end) {
        settleHandles.set(win, win.requestAnimationFrame(tick));
      }
    }

    settleHandles.set(win, win.requestAnimationFrame(tick));
  }

  function patchScrollIntoView(win) {
    const proto = win.Element && win.Element.prototype;
    if (!proto || proto.__tmOriginalScrollIntoView) return;

    proto.__tmOriginalScrollIntoView = proto.scrollIntoView;

    proto.scrollIntoView = function () {
      try {
        let el = null;

        if (typeof this.id === "string" && this.id.startsWith("caption-")) {
          el = this;
        } else if (this.closest) {
          el = this.closest('[id^="caption-"]');
        }

        if (el) {
          if (getLocked(el.ownerDocument.defaultView || win)) {
            moveCaptionHigher(el);
            stabilize(el.ownerDocument.defaultView || win, CFG.settleMs);
          }
          return;
        }
      } catch {}

      return proto.__tmOriginalScrollIntoView.apply(this, arguments);
    };
  }

  function watchActiveCaption(win) {
    const doc = win.document;
    if (!doc.body || doc[OBS_KEY]) return;
    doc[OBS_KEY] = true;

    const observer = new win.MutationObserver((mutations) => {
      if (!getLocked(win)) return;

      for (const mutation of mutations) {
        const el = mutation.target;
        if (!(el instanceof Element)) continue;

        if (
          (typeof el.id === "string" && el.id.startsWith("caption-")) ||
          el.classList.contains("activecaptionoutline") ||
          el.closest(".activecaptionoutline")
        ) {
          stabilize(win, CFG.settleMs);
          break;
        }
      }
    });

    observer.observe(doc.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  function buttonText(doc = document) {
    return getLocked(doc.defaultView || window)
      ? "Caption lock on"
      : "Caption lock off";
  }

  function updateButton(doc = document) {
    const btn = doc.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = buttonText(doc);
  }

  function sidebarButtonScore(el) {
    const text = [
      el.textContent || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      el.getAttribute("data-original-title") || "",
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    if (text.includes("show sidebar")) score += 5;
    if (text.includes("hide sidebar")) score += 5;
    if (text.includes("sidebar")) score += 2;
    if (text.includes("view_sidebar")) score += 4;
    return score;
  }

  function findSidebarButton(doc = document) {
    const candidates = [
      ...doc.querySelectorAll(
        'button, [role="button"], .v-btn, .v-toolbar button, .v-toolbar .v-btn',
      ),
    ];

    let best = null;
    let bestScore = 0;

    for (const el of candidates) {
      const score = sidebarButtonScore(el);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    if (best) return best;

    const icon = [...doc.querySelectorAll(".material-icons, .v-icon")].find(
      (el) => (el.textContent || "").toLowerCase().includes("view_sidebar"),
    );

    return icon
      ? icon.closest('button, [role="button"], .v-btn') || icon
      : null;
  }

  function createButton(doc) {
    const btn = doc.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.style.marginLeft = "8px";
    btn.style.height = "36px";
    btn.style.padding = "0 12px";
    btn.style.border = "1px solid rgba(0,0,0,0.2)";
    btn.style.borderRadius = "4px";
    btn.style.background = "#fff";
    btn.style.color = "inherit";
    btn.style.font = "inherit";
    btn.style.whiteSpace = "nowrap";
    btn.style.cursor = "pointer";
    btn.style.flex = "0 0 auto";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setLocked(
        !getLocked(doc.defaultView || window),
        doc.defaultView || window,
      );
    });
    updateButton(doc);
    return btn;
  }

  function ensureButton(doc = document) {
    if (doc.location.hostname !== "lrs.mcgill.ca") return true;
    if (!doc.body) return false;

    const sidebarBtn = findSidebarButton(doc);
    if (!sidebarBtn || !sidebarBtn.parentElement) return false;

    let btn = doc.getElementById(BTN_ID);
    if (!btn) btn = createButton(doc);

    if (
      btn.parentElement !== sidebarBtn.parentElement ||
      btn.previousElementSibling !== sidebarBtn
    ) {
      sidebarBtn.insertAdjacentElement("afterend", btn);
    }

    updateButton(doc);
    return true;
  }

  function installButton(win) {
    let tries = 0;

    function step() {
      tries += 1;
      if (ensureButton(win.document)) return;
      if (tries < 80) win.setTimeout(step, 250);
    }

    step();
    win.addEventListener("DOMContentLoaded", step, { once: true });
    win.addEventListener("load", step, { once: true });
  }

  function boot(win) {
    if (win[INSTALL_KEY]) return;
    win[INSTALL_KEY] = true;

    patchScrollIntoView(win);

    if (win.location.hostname === "lrs.mcgill.ca") {
      const start = () => {
        watchActiveCaption(win);
        installButton(win);
        if (getLocked(win)) stabilize(win, CFG.settleMs);
      };

      if (win.document.readyState === "loading") {
        win.document.addEventListener("DOMContentLoaded", start, {
          once: true,
        });
      } else {
        start();
      }
    }
  }

  boot(window);
})();
