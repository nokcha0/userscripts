// ==UserScript==
// @name         MyCourses Lecture Recordings Save Transcription
// @namespace    https://mycourses2.mcgill.ca/
// @version      1.0.5
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
  let latestCaptionGuid = null;
  let cachedRecordings = [];
  let cachedCourse = null;

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

  function watchResponseInfo(url) {
    const path = String(url);
    const captionVtt = path.match(/\/captionsvtt\/([a-f\d-]{36})\.vtt\//i);
    if (captionVtt) latestCaptionGuid = captionVtt[1];
    return (
      captionRequestInfo(path) ||
      /\/(?:MediaRecordings?|Course)\/(?:dto\/)?[^/?#]+(?:[?#]|$)/i.test(path)
    );
  }

  function rememberMetadata(url, value) {
    const path = String(url);
    if (/\/MediaRecordings?\/dto\/[^/?#]+(?:[?#]|$)/i.test(path)) {
      if (Array.isArray(value)) cachedRecordings = value;
    } else if (/\/Course\/\d+(?:[?#]|$)/i.test(path)) {
      if (value && typeof value === "object" && !Array.isArray(value))
        cachedCourse = value;
    }
  }

  function parseAndRemember(url, value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      rememberCaptions(url, parsed);
      rememberMetadata(url, parsed);
    } catch {}
  }

  function watchCaptionRequests(win) {
    const xhrProto = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (xhrProto && !xhrProto.__tmTranscriptOriginalOpen) {
      xhrProto.__tmTranscriptOriginalOpen = xhrProto.open;
      xhrProto.open = function (method, url) {
        this[XHR_URL] = String(url);
        const relevant = watchResponseInfo(this[XHR_URL]);
        this.addEventListener(
          "load",
          () => {
            if (!relevant) return;
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
        if (watchResponseInfo(url)) {
          response
            .clone()
            .json()
            .then((value) => parseAndRemember(url, value))
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
    const recordings =
      vm && Array.isArray(vm.listofRecordings) && vm.listofRecordings.length
        ? vm.listofRecordings
        : cachedRecordings;
    const selectedId = vm && vm.currentRecordingID;
    return (
      recordings.find((recording) => selectedId && String(recording.id) === String(selectedId)) ||
      recordings.find(
        (recording) =>
          latestCaptionGuid &&
          String(recording.id).toLowerCase() === latestCaptionGuid.toLowerCase(),
      ) ||
      recordings.find(
        (recording) =>
          latestCaptionResponse &&
          String(recording.recordingInt) === latestCaptionResponse.recordingId,
      ) ||
      (recordings.length === 1 ? recordings[0] : null)
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
    const course = vm && vm.currentCourse;
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

    return { captions, recording, course };
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
      recording.dateTime,
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

  function contentPathMetadata(value) {
    const match = String(value || "").match(
      /\/content\/[^/]+\/([^/]+)\/(20\d{2})(\d{2})(\d{2})_/i,
    );
    if (!match) return null;
    let course = match[1];
    try {
      course = decodeURIComponent(course);
    } catch {}
    return { course, date: `${match[2]}-${match[3]}-${match[4]}` };
  }

  function pageRecordingMetadata(doc) {
    const elements = doc.querySelectorAll(
      'video[poster], .vjs-poster, .vcard_active [src], .vcard_active [style]',
    );
    for (const element of elements) {
      for (const attribute of ["poster", "src", "style"]) {
        const value = element.getAttribute(attribute) || "";
        const metadata = contentPathMetadata(value);
        if (metadata) return metadata;
      }
    }

    const toolbar = [...doc.querySelectorAll(".v-toolbar__title")].find(
      (element) => /20\d{2}-(?:FALL|WINTER|SUMMER)\s*\//i.test(element.textContent),
    );
    const course = toolbar && toolbar.textContent.match(
      /20\d{2}-(?:FALL|WINTER|SUMMER)\s*\/\s*([A-Z0-9-]+)/i,
    );
    const activeDate = doc.querySelector(
      ".vcard_active .recordingdate, .vcard_active .recordingtitle",
    );
    const date = activeDate && activeDate.textContent.match(
      /\b(20\d{2})\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
    );
    const month = date &&
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        .indexOf(date[2].slice(0, 3).toLowerCase()) + 1;

    return {
      course: course ? course[1] : "",
      date: month ? `${date[1]}-${String(month).padStart(2, "0")}-${date[3].padStart(2, "0")}` : "",
    };
  }

  function transcriptFilename(recording, courseDetails, doc) {
    const page = pageRecordingMetadata(doc);
    const thumbnail = contentPathMetadata(recording && recording.thumbnail);
    const course =
      safeFilenamePart(
        (courseDetails && (courseDetails.courseNameDisplay || courseDetails.courseName)) ||
          page.course ||
          (recording && recording.courseName) ||
          (thumbnail && thumbnail.course) ||
          (cachedCourse && (cachedCourse.courseNameDisplay || cachedCourse.courseName)),
      ) || "Lecture";
    const date = recordingDate(recording) || (thumbnail && thumbnail.date) || page.date || "Undated";
    return `${course}-${date}-Transcript.txt`;
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
    const { captions, recording, course } = transcriptDetails(win.document);
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

    saveBlob(win, `${lines.join("\r\n")}\r\n`, transcriptFilename(recording, course, win.document));
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
