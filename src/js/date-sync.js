/**
 * date-sync.js  —  NWKS Encounter gateway date synchroniser
 *
 * On DOMContentLoaded, fetches /api/public/events/current for both programs
 * via window.NWKS_API_BASE (set by config.js; defaults to '' for same-origin)
 * and replaces the text content of the two `.dates` divs in the gateway DOM.
 *
 * Targeting strategy (zero changes to existing classes or structure required):
 *   Men's date  → document.querySelector('[data-nwks-date="mens"]')
 *   Women's date → document.querySelector('[data-nwks-date="women"]')
 *
 * If either fetch fails or the element is absent, the existing hard-coded text
 * is left untouched — the site NEVER shows a blank date.
 *
 * Date display format matches the gateway's existing text exactly:
 *   "August 6 – 8, 2026"  (en dash, long month name, no leading zeros)
 */
(function () {
  'use strict';

  var MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  /**
   * Convert a YYYY-MM-DD string to a display date fragment.
   * Returns null if the input is falsy or malformed.
   * @param {string|null} iso
   * @returns {string|null}  e.g. "August 6"
   */
  function isoToDisplay(iso) {
    if (!iso) return null;
    var parts = iso.split('-');
    if (parts.length !== 3) return null;
    var month = parseInt(parts[1], 10);
    var day   = parseInt(parts[2], 10);
    if (isNaN(month) || isNaN(day) || month < 1 || month > 12) return null;
    return MONTH_NAMES[month - 1] + ' ' + day;
  }

  /**
   * Build the full date range string matching gateway style.
   * If only start is present: "August 6, 2026"
   * If start+end same month:  "August 6 – 8, 2026"
   * If different months:      "July 17 – August 8, 2026"
   * @param {string|null} startIso
   * @param {string|null} endIso
   * @param {number|null} year
   * @returns {string|null}
   */
  function formatDateRange(startIso, endIso, year) {
    var startDisplay = isoToDisplay(startIso);
    if (!startDisplay) return null;
    var yearSuffix = year ? ', ' + year : '';
    if (!endIso) return startDisplay + yearSuffix;

    var endDisplay = isoToDisplay(endIso);
    if (!endDisplay) return startDisplay + yearSuffix;

    var startParts = startIso.split('-');
    var endParts   = endIso.split('-');
    var sameMonth  = startParts[1] === endParts[1];

    if (sameMonth) {
      // "August 6 – 8, 2026"  (just the end day, not the full end display)
      var endDay = parseInt(endParts[2], 10);
      return startDisplay + ' – ' + endDay + yearSuffix;
    }
    // Different months: "July 17 – August 8, 2026"
    return startDisplay + ' – ' + endDisplay + yearSuffix;
  }

  /**
   * Fetch the current event for one program and, if successful, update the DOM.
   * @param {'mens'|'women'} program
   */
  function syncProgram(program) {
    var el = document.querySelector('[data-nwks-date="' + program + '"]');
    if (!el) return; // element absent — no-op (safe)

    var base = (typeof window !== 'undefined' && window.NWKS_API_BASE) ? window.NWKS_API_BASE : '';
    fetch(base + '/api/public/events/current?program=' + program, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.ok || !data.event) return; // fallback: leave existing text
        var ev = data.event;
        var range = formatDateRange(ev.start_date, ev.end_date, ev.year);
        if (range) {
          el.textContent = range;
        }
        // If range is null (no dates set yet), leave the existing hard-coded text.
      })
      .catch(function () {
        // Network error / CF error — leave hard-coded text; never blank the date.
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncProgram('mens');
    syncProgram('women');
  });
})();
