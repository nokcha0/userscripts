// ==UserScript==
// @name         MyCourses Lecture Recordings Save Transcription
// @namespace    https://mycourses2.mcgill.ca/
// @version      1.0.1
// @updateURL    https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-lecture-recordings-save-transcription.user.js
// @downloadURL  https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-lecture-recordings-save-transcription.user.js
// @description  Adds a button to save the current lecture recording transcript as a TXT file.
// @match        https://mycourses2.mcgill.ca/d2l/lp/*
// @match        https://lrs.mcgill.ca/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const BUTTON_ID = "__tm_save_transcription_btn__";
  const CAPTION_LOCK_BUTTON_ID = "__tm_caption_lock_btn__";
  const INSTALL_KEY = "__tm_save_transcription_installed__";
  const XHR_URL = Symbol("transcriptUrl");

  let latestCaptionResponse = null;

  function captionRequestInfo(url) {
    const match = String(url).match(
      /\/CaptionDatas\/(\d+)\/-99\/([^/?#]+)/i,
    );
    return match
      ? { recordingId: match[1], language: decodeURIComponent(match[2]) }
      : null;
  }

  function rememberCaptions(url, value) {
    const request = captionRequestInfo(url);
    if (!request || !Array.isArray(value)) return;
    if (!value.every((item) => item && typeof item.captionText === "string"))
      return;

    latestCaptionResponse = {
      captions: value,
      recordingId: request.recordingId,
      language: request.language,
    };
  }

  function parseAndRemember(url, value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      rememberCaptions(url, parsed);
    } catch {}
  }

  function watchCaptionRequests(win) {
    const xhrProto = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (xhrProto && !xhrProto.__tmTranscriptOriginalOpen) {
      xhrProto.__tmTranscriptOriginalOpen = xhrProto.open;
      xhrProto.open = function (method, url) {
        this[XHR_URL] = String(url);
        this.addEventListener(
          "load",
          () => {
            if (!captionRequestInfo(this[XHR_URL])) return;
            try {
              parseAndRemember(
                this[XHR_URL],
                this.responseType === "" || this.responseType === "text"
                  ? this.responseText
                  : this.response,
              );
            } catch {}
          },
          { once: true },
        );
        return xhrProto.__tmTranscriptOriginalOpen.apply(this, arguments);
      };
    }

    if (typeof win.fetch === "function" && !win.fetch.__tmTranscriptOriginal) {
      const originalFetch = win.fetch;
      async function patchedFetch(input) {
        const response = await originalFetch.apply(this, arguments);
        const url = typeof input === "string" ? input : input && input.url;
        if (captionRequestInfo(url)) {
          response
            .clone()
            .json()
            .then((value) => rememberCaptions(url, value))
            .catch(() => {});
        }
        return response;
      }
      patchedFetch.__tmTranscriptOriginal = originalFetch;
      win.fetch = patchedFetch;
    }
  }

  function findVueContext(doc = document) {
    const root = doc.getElementById("app");
    if (!root || !root.__vue__) return null;

    const queue = [root.__vue__];
    const seen = new Set();
    let fallback = null;

    while (queue.length) {
      const vm = queue.shift();
      if (!vm || seen.has(vm)) continue;
      seen.add(vm);

      if (Array.isArray(vm.allcaptions)) {
        fallback = fallback || vm;
        if (vm.allcaptions.length) return vm;
      }

      if (Array.isArray(vm.$children)) queue.push(...vm.$children);
    }

    return fallback;
  }

  function currentRecording(vm) {
    if (!vm || !Array.isArray(vm.listofRecordings)) return null;
    return (
      vm.listofRecordings.find(
        (recording) => String(recording.id) === String(vm.currentRecordingID),
      ) || null
    );
  }

  function renderedCaptions(doc = document) {
    return [...doc.querySelectorAll('[id^="caption-"]')]
      .filter(
        (element, index, all) =>
          all.findIndex((other) => other.id === element.id) === index,
      )
      .map((element) => ({ captionText: element.textContent || "" }))
      .filter((caption) => caption.captionText.trim());
  }

  function transcriptDetails(doc = document) {
    const vm = findVueContext(doc);
    const recording = currentRecording(vm);
    let captions =
      vm && Array.isArray(vm.allcaptions) && vm.allcaptions.length
        ? vm.allcaptions
        : null;

    const cacheMatchesRecording =
      latestCaptionResponse &&
      (!recording ||
        recording.recordingInt == null ||
        String(recording.recordingInt) === latestCaptionResponse.recordingId);

    if (!captions && cacheMatchesRecording) {
      captions = latestCaptionResponse.captions;
    }
    if (!captions || !captions.length) captions = renderedCaptions(doc);

    return { captions, recording };
  }

  function safeFilenamePart(value) {
    return String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
  }

  function recordingDate(recording) {
    if (!recording) return "";

    const values = [
      recording.recordingDate,
      recording.recordingDateTime,
      recording.startDateTime,
      recording.createdDateTime,
      recording.recordingFolder,
    ];

    for (const value of values) {
      if (!value) continue;
      const match = String(value).match(/(20\d{2})[-/]?(\d{2})[-/]?(\d{2})/);
      if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }

    return "";
  }

  function transcriptFilename(recording) {
    const course = safeFilenamePart(recording && recording.courseName);
    const date = recordingDate(recording);
    const parts = [course, date].filter(Boolean);
    return parts.length ? `${parts.join(" - ")}.txt` : "lecture-transcription.txt";
  }

  function saveBlob(win, text, filename) {
    const blob = new win.Blob([text], { type: "text/plain;charset=utf-8" });
    const url = win.URL.createObjectURL(blob);
    const link = win.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    win.document.body.appendChild(link);
    link.click();
    link.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }

  function saveTranscription(win = window) {
    const { captions, recording } = transcriptDetails(win.document);
    const lines = captions
      .filter((caption) => caption && typeof caption.captionText === "string")
      .map((caption) => caption.captionText.trim())
      .filter(Boolean);

    if (!lines.length) {
      win.alert(
        "No transcription is loaded yet. Select a recording with captions and try again.",
      );
      return;
    }

    saveBlob(win, `${lines.join("\r\n")}\r\n`, transcriptFilename(recording));
  }

  function sidebarButtonScore(element) {
    const text = [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-original-title") || "",
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

    for (const element of candidates) {
      const score = sidebarButtonScore(element);
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    if (best) return best;
    const icon = [...doc.querySelectorAll(".material-icons, .v-icon")].find(
      (element) =>
        (element.textContent || "").toLowerCase().includes("view_sidebar"),
    );
    return icon
      ? icon.closest('button, [role="button"], .v-btn') || icon
      : null;
  }

  function createButton(doc) {
    const button = doc.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Save transcription";
    button.title = "Save the full transcription as a TXT file";
    button.style.marginLeft = "8px";
    button.style.height = "36px";
    button.style.padding = "0 12px";
    button.style.border = "1px solid rgba(0,0,0,0.2)";
    button.style.borderRadius = "4px";
    button.style.background = "#fff";
    button.style.color = "inherit";
    button.style.font = "inherit";
    button.style.whiteSpace = "nowrap";
    button.style.cursor = "pointer";
    button.style.flex = "0 0 auto";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      saveTranscription(doc.defaultView || window);
    });
    return button;
  }

  function ensureButton(doc = document) {
    if (doc.location.hostname !== "lrs.mcgill.ca" || !doc.body) return false;

    const sidebarButton = findSidebarButton(doc);
    if (!sidebarButton || !sidebarButton.parentElement) return false;
    const captionLockButton = doc.getElementById(CAPTION_LOCK_BUTTON_ID);
    const anchor = captionLockButton || sidebarButton;
    if (!anchor.parentElement) return false;

    let button = doc.getElementById(BUTTON_ID);
    if (!button) button = createButton(doc);
    if (
      button.parentElement !== anchor.parentElement ||
      button.previousElementSibling !== anchor
    ) {
      anchor.insertAdjacentElement("afterend", button);
    }
    return true;
  }

  function installButton(win) {
    let tries = 0;
    function step() {
      tries += 1;
      if (!ensureButton(win.document) && tries < 120) {
        win.setTimeout(step, 250);
      }
    }

    step();
    win.addEventListener("DOMContentLoaded", step, { once: true });
    win.addEventListener("load", step, { once: true });
  }

  function boot(win) {
    if (win[INSTALL_KEY]) return;
    win[INSTALL_KEY] = true;
    watchCaptionRequests(win);

    if (win.location.hostname === "lrs.mcgill.ca") {
      if (win.document.readyState === "loading") {
        win.document.addEventListener(
          "DOMContentLoaded",
          () => installButton(win),
          { once: true },
        );
      } else {
        installButton(win);
      }
    }
  }

  boot(window);
})();
