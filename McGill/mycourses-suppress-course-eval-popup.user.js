// ==UserScript==
// @name         MyCourses Suppress Mercury Course Evaluation Popup
// @namespace    http://tampermonkey.net/
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-suppress-course-eval-popup.user.js
// @downloadURL  https://raw.githubusercontent.com/nokcha0/userscripts/main/McGill/mycourses-suppress-course-eval-popup.user.js
// @match        https://mycourses2.mcgill.ca/d2l/home*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  function containsMercuryEvalPopup(node) {
    if (!node) return false;

    const isElement = node.nodeType === 1;
    const isFragment = node.nodeType === 11;
    if (!isElement && !isFragment) return false;

    let overlay = null;

    if (isElement && node.id === "dvOuter") {
      overlay = node;
    } else if (node.querySelector) {
      overlay = node.querySelector("#dvOuter");
    }

    if (!overlay) return false;

    const inner = overlay.querySelector("#dvInner_SeriousTask");
    if (!inner) return false;

    const text = (overlay.textContent || "").toLowerCase();
    const hasMercuryImage = !!overlay.querySelector(
      'img[src*="mercury.png" i]',
    );
    const mentionsMercury = text.includes("mercury");
    const mentionsEvaluation = text.includes("evaluation");

    return hasMercuryImage || (mentionsMercury && mentionsEvaluation);
  }

  const originalAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function (child) {
    if (containsMercuryEvalPopup(child)) {
      console.log("Blocked Mercury course evaluation popup");
      return child;
    }
    return originalAppendChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (containsMercuryEvalPopup(newNode)) {
      console.log("Blocked Mercury course evaluation popup");
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
})();
