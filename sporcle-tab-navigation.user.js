// ==UserScript==
// @name         Sporcle Tab to next
// @namespace    http://tampermonkey.net/
// @version      1.1
// @updateURL    https://raw.githubusercontent.com/nokcha0/userscripts/main/sporcle-tab-navigation.user.js
// @downloadURL  https://raw.githubusercontent.com/nokcha0/userscripts/main/sporcle-tab-navigation.user.js
// @description  tab / shift tab : next / prev
// @match        https://www.sporcle.com/games/*
// @match        https://sporcle.com/games/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function onKeyDown(e) {
        const input = document.getElementById('gameinput');
        if (!input) return;

        // Only intercept Tab when the text box itself is focused
        if (e.key !== 'Tab') return;
        if (document.activeElement !== input) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Same behavior as the page buttons:
        // Next button => pickSlot()
        // Previous button => pickPreviousSlot()
        if (e.shiftKey) {
            if (typeof window.pickPreviousSlot === 'function') {
                window.pickPreviousSlot();
            } else {
                document.getElementById('previousButton')?.click();
            }
        } else {
            if (typeof window.pickSlot === 'function') {
                window.pickSlot();
            } else {
                document.getElementById('nextButton')?.click();
            }
        }

        // Keep typing focus in the answer box
        setTimeout(() => {
            const freshInput = document.getElementById('gameinput');
            if (freshInput) freshInput.focus();
        }, 0);
    }

    window.addEventListener('keydown', onKeyDown, true);
})();
