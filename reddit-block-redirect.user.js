// ==UserScript==
// @name         Reddit Blocked Page Redirect
// @namespace    reddit-block-redirect
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/nokcha0/userscripts/main/reddit-block-redirect.user.js
// @downloadURL  https://raw.githubusercontent.com/nokcha0/userscripts/main/reddit-block-redirect.user.js
// @description  Redirect to Redlib when it detects a Reddit blocked page
// @match        https://reddit.com/*
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BLOCK_MESSAGE = "You've been blocked by network security.";

    if (!document.body || !document.body.innerText.includes(BLOCK_MESSAGE)) {
        return;
    }

    const button = document.createElement('button');
    button.textContent = 'Open in Redlib';

    button.style.cssText = `
        position: fixed !important;
        top: 16px !important;
        right: 16px !important;
        left: auto !important;
        bottom: auto !important;
        z-index: 2147483647 !important;

        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;

        box-sizing: border-box !important;

        padding: 8px 12px !important;
        margin: 0 !important;

        background: #ffffff !important;
        color: #111111 !important;

        border: 1px solid #dcdcdc !important;
        border-radius: 7px !important;

        font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Arial,
            sans-serif !important;

        font-size: 13px !important;
        font-weight: 500 !important;
        line-height: 1 !important;

        white-space: nowrap !important;

        cursor: pointer !important;

        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
    `;

    button.addEventListener('mouseenter', () => {
        button.style.setProperty('background', '#f5f5f5', 'important');
    });

    button.addEventListener('mouseleave', () => {
        button.style.setProperty('background', '#ffffff', 'important');
    });

    button.addEventListener('click', () => {
        const newURL = new URL(window.location.href);

        newURL.hostname = 'redlib.catsarch.com';

        window.location.href = newURL.href;
    });

    document.body.appendChild(button);
})();
