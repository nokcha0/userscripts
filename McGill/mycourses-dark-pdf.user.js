// ==UserScript==
// @name         MyCourses better PDF View - Dark Mode
// @namespace    https://tampermonkey.net/
// @version      0.3
// @updateURL    https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-dark-pdf.user.js
// @downloadURL  https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-dark-pdf.user.js
// @match        https://mycourses2.mcgill.ca/d2l/le/lessons/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  "use strict";
  if (window.__tmPdfDarkInstalled) return;
  window.__tmPdfDarkInstalled = true;

  const FILTER =
    "invert(0.64) contrast(2.24) brightness(0.80) hue-rotate(180deg) contrast(1.3)";
  const TOP = 44,
    KEY = "dark_pdf",
    BTN = "dark-pdf";

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
  const isTopics = () =>
    /\/d2l\/le\/lessons\/\d+\/topics\/\d+/.test(location.pathname);

  const state = { on: false };
  try {
    state.on = localStorage.getItem(KEY) === "1";
  } catch {}

  let pending = false,
    forceNext = false,
    cur = null,
    retry = null;

  function ensureBtn() {
    let b = qs(`#${BTN}`);
    if (!b) {
      b = document.createElement("button");
      b.id = BTN;
      b.type = "button";
      b.textContent = "Toggle Dark PDF";
      b.addEventListener("mousedown", (e) => e.stopPropagation(), true);
      b.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          state.on = !state.on;
          try {
            localStorage.setItem(KEY, state.on ? "1" : "0");
          } catch {}
          scheduleApply(true);
          kickRetry();
        },
        true,
      );
      document.body.appendChild(b);
    }
    b.style.display = isTopics() ? "block" : "none";
    b.title = state.on ? "Disable PDF dark mode" : "Enable PDF dark mode";
  }

  function deepQueryAll(root, selector) {
    const out = [],
      seen = new Set();
    const walk = (node) => {
      if (!node) return;
      if (node.querySelectorAll)
        node.querySelectorAll(selector).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            out.push(el);
          }
        });
      const kids = node.children ? Array.from(node.children) : [];
      for (const el of kids) {
        if (el.shadowRoot) walk(el.shadowRoot);
        walk(el);
      }
    };
    walk(root);
    return out;
  }

  function smartCurriculumFrame() {
    const fra = qs(".d2l-fra-iframe");
    const f1 = fra ? qs("iframe", fra) : null;
    if (f1) return f1;
    return (
      qsa("iframe").sort(
        (a, b) =>
          b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
      )[0] || null
    );
  }

  function bestPdfTarget(doc) {
    const sel =
      'd2l-pdf-viewer,d2l-document-viewer,embed[type="application/pdf"],object[type="application/pdf"],#viewerContainer,.pdfViewer,#viewer,iframe';
    const cands = deepQueryAll(doc, sel);

    const score = (el) => {
      const r = el.getBoundingClientRect?.() || { width: 0, height: 0 };
      const area = (r.width || 0) * (r.height || 0);
      if (area < 200 * 200) return -1;

      const tag = (el.tagName || "").toLowerCase();
      const id = (el.id || "").toLowerCase();
      const cls = (el.className || "").toString().toLowerCase();
      const src = (
        el.getAttribute?.("src") ||
        el.getAttribute?.("data") ||
        ""
      ).toLowerCase();
      const typ = (el.getAttribute?.("type") || "").toLowerCase();

      let s = Math.log(area + 1);
      if (tag.includes("pdf")) s += 60;
      if (typ.includes("pdf")) s += 60;
      if (src.includes(".pdf")) s += 80;
      if (id.includes("viewer") || cls.includes("pdf")) s += 25;
      if (
        tag === "iframe" &&
        (src.includes("smart-curriculum") || src.includes("/d2l/ui/apps/"))
      )
        s -= 100;
      return s;
    };

    let best = null,
      bestS = -1;
    for (const el of cands) {
      const s = score(el);
      if (s > bestS) {
        bestS = s;
        best = el;
      }
    }
    return best;
  }

  function clearIn(doc) {
    if (cur) {
      clr(cur, "filter");
      clr(cur, "background");
      cur.removeAttribute("data-tm-pdf-dark");
      cur = null;
    }
    qsa('[data-tm-pdf-dark="1"]', doc).forEach((el) => {
      clr(el, "filter");
      clr(el, "background");
      el.removeAttribute("data-tm-pdf-dark");
    });
  }

  function setOn(el, doc) {
    if (!el) return false;
    if (cur === el && el.getAttribute("data-tm-pdf-dark") === "1") return true;
    clearIn(doc);
    imp(el, "filter", FILTER);
    imp(el, "background", "#111");
    el.setAttribute("data-tm-pdf-dark", "1");
    cur = el;
    return true;
  }

  function apply(force = false) {
    ensureBtn();
    if (!isTopics()) return;

    const appFrame = smartCurriculumFrame();
    let appDoc = null;
    try {
      appDoc = appFrame?.contentDocument;
    } catch {}
    if (!appDoc) return;

    if (!state.on) {
      clearIn(appDoc);
      return;
    }

    if (cur && cur.isConnected) return; // already applied, don’t touch (prevents flicker)
    if (!cur && !force && state.on) {
    } // allow retries while waiting for viewer

    const t = bestPdfTarget(appDoc);
    if (t) setOn(t, appDoc);
  }

  function scheduleApply(force = false) {
    forceNext ||= force;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const f = forceNext;
      forceNext = false;
      apply(f);
    });
  }

  function kickRetry() {
    if (retry) {
      clearInterval(retry);
      retry = null;
    }
    if (!state.on) return;
    let n = 0;
    retry = setInterval(() => {
      if (!state.on || (cur && cur.isConnected) || !isTopics() || ++n > 20) {
        clearInterval(retry);
        retry = null;
        return;
      }
      scheduleApply(true);
    }, 250);
  }

  function hookNav() {
    const fire = () => {
      cur = null;
      scheduleApply(true);
      kickRetry();
    };
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
  kickRetry();
  new MutationObserver(() => scheduleApply()).observe(
    document.documentElement,
    { childList: true, subtree: true },
  );
  addEventListener("resize", () => scheduleApply());
})();
