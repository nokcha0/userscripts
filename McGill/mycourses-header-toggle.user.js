// ==UserScript==
// @name         MyCourses better PDF View - Header Toggle
// @namespace    https://tampermonkey.net/
// @version      0.3
// @match        https://mycourses2.mcgill.ca/d2l/le/lessons/*
// @match        https://mycourses2.mcgill.ca/d2l/lp/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  "use strict";
  if (window.__tmHeaderToggleInstalled) return;
  window.__tmHeaderToggleInstalled = true;

  const BTN = "toggle-header",
    TOP = 15;
  GM_addStyle(`
    #${BTN}{
      position:fixed; top:${TOP}px; left:8px; z-index:2147483647;
      font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      padding:6px 10px; border-radius:10px; cursor:pointer; user-select:none;
      border:1px solid rgba(255,255,255,.25); color:#fff; background:rgba(0,0,0,.62);
      box-shadow:0 4px 14px rgba(0,0,0,.25);
    }
    #${BTN}:hover{ background:rgba(0,0,0,.75); }
    #${BTN}:active{ transform:translateY(1px); }
  `);

  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const imp = (el, p, v) => el && el.style.setProperty(p, v, "important");
  const clr = (el, p) => el && el.style.removeProperty(p);

  const state = { hidden: false };
  let pending = false,
    lastSig = "",
    lastHidden = null;

  const header = () => {
    const navigation = qs("d2l-navigation, d2l-navigation-main-header");
    if (navigation) return navigation.closest("header");

    return (
      qsa("header").find(
        (h) =>
          h.querySelector("nav") &&
          !h.closest('dialog, [role="dialog"], .d2l-dialog'),
      ) || null
    );
  };

  const frames = () => {
    const fra = qs(".d2l-fra-iframe");
    const inFra = fra ? qsa("iframe", fra) : [];
    if (inFra.length) return { fra, list: inFra, sig: "fra:" + inFra.length };
    const big = qsa("iframe").filter((f) => {
      const r = f.getBoundingClientRect();
      return r.width > 200 && r.height > 200;
    });
    return { fra, list: big, sig: "big:" + big.length };
  };

  function ensureBtn(h) {
    const existing = qs(`#${BTN}`);
    if (!h) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const b = document.createElement("button");
    b.id = BTN;
    b.type = "button";
    b.textContent = "Toggle header";
    b.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    b.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.hidden = !state.hidden;
        scheduleApply(true);
      },
      true,
    );
    document.body.appendChild(b);
  }

  function apply(force = false) {
    const h = header();
    ensureBtn(h);
    const { fra, list, sig } = frames();
    const curSig = (h ? "h:1|" : "h:0|") + sig;

    if (!force && state.hidden === lastHidden && curSig === lastSig) return;
    lastHidden = state.hidden;
    lastSig = curSig;

    if (h) {
      if (h.dataset.tmOrigDisplay === undefined)
        h.dataset.tmOrigDisplay = h.style.display || "";
      state.hidden
        ? imp(h, "display", "none")
        : (clr(h, "display"),
          (h.style.display = h.dataset.tmOrigDisplay || ""));
    }

    if (fra)
      state.hidden
        ? (imp(fra, "height", "100vh"), imp(fra, "min-height", "100vh"))
        : (clr(fra, "height"), clr(fra, "min-height"));

    list.forEach((f) => {
      if (state.hidden) {
        imp(f, "height", "100vh");
        imp(f, "min-height", "100vh");
        imp(f, "width", "100%");
      } else {
        clr(f, "height");
        clr(f, "min-height");
        clr(f, "width");
      }
    });

    const b = qs(`#${BTN}`);
    if (b)
      b.title = state.hidden
        ? "Show Brightspace header"
        : "Hide Brightspace header";
  }

  function scheduleApply(force = false) {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      apply(force);
    });
  }

  function hookNav() {
    const fire = () => scheduleApply();
    const wrap = (fn) =>
      function () {
        const r = fn.apply(this, arguments);
        fire();
        return r;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    addEventListener("popstate", fire);
  }

  hookNav();
  scheduleApply(true);
  new MutationObserver(() => scheduleApply()).observe(
    document.documentElement,
    { childList: true, subtree: true },
  );
  addEventListener("resize", () => scheduleApply());
})();
