/* ============================================================
   Alice Q. Wong — interactive resume
   No dependencies. Everything degrades to a readable document
   when JavaScript is off (the `js` class is what hides things).
   ============================================================ */

(function () {
  'use strict';

  var root  = document.documentElement;
  var live  = document.getElementById('live');
  var jobs  = Array.prototype.slice.call(document.querySelectorAll('.job'));
  var marks = [];                       // every <mark> we injected, for cleanup
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function announce(msg) { if (live) live.textContent = msg; }

  /* ---- Theme ------------------------------------------------ */

  var themeBtn = document.getElementById('theme');

  function paintTheme() {
    var dark = root.dataset.theme === 'dark';
    themeBtn.setAttribute('aria-pressed', String(dark));
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  themeBtn.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('cv-theme', root.dataset.theme); } catch (e) { /* ignore */ }
    paintTheme();
  });
  paintTheme();

  /* ---- Reading progress ------------------------------------- */

  var bar = document.querySelector('.progress__bar');
  var toolbar = document.getElementById('toolbar');
  var ticking = false;

  function onScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    bar.style.transform = 'scaleX(' + pct + ')';
    toolbar.classList.toggle('is-stuck', toolbar.getBoundingClientRect().top <= 0.5);
    sweep();
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---- Reveal on scroll ------------------------------------- */

  var pending = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var io = null;

  function reveal(el) {
    el.classList.add('is-in');
    if (io) io.unobserve(el);
  }

  /* Safety net. IntersectionObserver only samples at frame boundaries, so a
     jump (anchor link, Cmd+End, skip-link) can skip straight past an element
     without it ever being reported as visible — and that content would then
     stay at opacity 0 for good. This sweeps anything the viewport has reached.
     It costs a handful of rect reads and stops entirely once the list empties. */
  function sweep() {
    if (!pending || !pending.length) return;   // may run before `pending` is set
    var limit = window.innerHeight;
    pending = pending.filter(function (el) {
      if (el.getBoundingClientRect().top >= limit) return true;
      reveal(el);
      return false;
    });
  }

  if (reduceMotion || !('IntersectionObserver' in window)) {
    pending.forEach(function (el) { el.classList.add('is-in'); });
    pending = [];
  } else {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        pending = pending.filter(function (el) { return el !== entry.target; });
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });

    pending.forEach(function (el) { io.observe(el); });
  }

  window.addEventListener('resize', sweep, { passive: true });

  // A page opened in a background tab gets neither rAF nor IntersectionObserver
  // callbacks, so catch up the moment it is actually looked at.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sweep();
  });

  /* ---- Collapse / expand ------------------------------------ */

  function setCollapsed(job, collapsed) {
    job.dataset.collapsed = String(collapsed);
    job.querySelector('.job__head').setAttribute('aria-expanded', String(!collapsed));
  }

  function isCollapsed(job) { return job.dataset.collapsed === 'true'; }

  document.getElementById('jobs').addEventListener('click', function (event) {
    var head = event.target.closest('.job__head');
    if (!head) return;
    var job = head.closest('.job');
    setCollapsed(job, !isCollapsed(job));
    syncToggleAll();
  });

  var toggleAll = document.getElementById('toggleAll');

  function syncToggleAll() {
    var visible = jobs.filter(function (j) { return !j.classList.contains('is-hidden'); });
    var allCollapsed = visible.length > 0 && visible.every(isCollapsed);
    toggleAll.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
    toggleAll.setAttribute('aria-pressed', String(allCollapsed));
  }

  toggleAll.addEventListener('click', function () {
    var collapse = toggleAll.getAttribute('aria-pressed') === 'false';
    jobs.forEach(function (job) { setCollapsed(job, collapse); });
    syncToggleAll();
    announce(collapse ? 'All roles collapsed.' : 'All roles expanded.');
  });
  syncToggleAll();

  /* ---- Keyword filter --------------------------------------- */

  var input    = document.getElementById('q');
  var clearBtn = document.getElementById('clear');
  var chips    = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var countEl  = document.getElementById('count');
  var emptyEl  = document.getElementById('empty');
  var stateBeforeSearch = null;          // collapse states to restore on clear
  var activeTerm = '';                   // the filter currently on screen

  function escapeRe(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function highlight(scope, re) {
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentNode.nodeName === 'MARK') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var targets = [];
    var node;
    while ((node = walker.nextNode())) targets.push(node);

    targets.forEach(function (textNode) {
      var text = textNode.nodeValue;
      var frag = null;
      var last = 0;
      var match;

      re.lastIndex = 0;
      while ((match = re.exec(text)) !== null) {
        if (match[0] === '') { re.lastIndex++; continue; }
        frag = frag || document.createDocumentFragment();
        if (match.index > last) {
          frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        }
        var mark = document.createElement('mark');
        mark.className = 'hit';
        mark.textContent = match[0];     // textContent, never innerHTML
        frag.appendChild(mark);
        marks.push(mark);
        last = match.index + match[0].length;
      }

      if (frag) {
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        textNode.parentNode.replaceChild(frag, textNode);
      }
    });
  }

  function clearHighlights() {
    marks.forEach(function (mark) {
      var parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    marks.length = 0;
  }

  function applyFilter(term) {
    clearHighlights();
    term = term.trim();
    activeTerm = term;

    clearBtn.hidden = term === '';
    chips.forEach(function (chip) {
      chip.setAttribute('aria-pressed', String(chip.dataset.term === term.toLowerCase()));
    });

    if (!term) {
      if (stateBeforeSearch) {
        jobs.forEach(function (job, i) { setCollapsed(job, stateBeforeSearch[i]); });
        stateBeforeSearch = null;
      }
      jobs.forEach(function (job) { job.classList.remove('is-hidden'); });
      emptyEl.hidden = true;
      countEl.textContent = '';
      syncToggleAll();
      return;
    }

    if (!stateBeforeSearch) stateBeforeSearch = jobs.map(isCollapsed);

    var re = new RegExp(escapeRe(term), 'gi');
    var hits = 0;

    jobs.forEach(function (job) {
      var match = re.test(job.textContent);
      re.lastIndex = 0;
      job.classList.toggle('is-hidden', !match);
      if (!match) return;
      hits++;
      setCollapsed(job, false);          // a match is only useful if you can read it
      highlight(job, re);
    });

    emptyEl.hidden = hits > 0;
    countEl.textContent = hits + (hits === 1 ? ' role matches “' : ' roles match “') + term + '”';
    announce(countEl.textContent);
    syncToggleAll();
  }

  var debounce;
  input.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { applyFilter(input.value); }, 120);
  });

  // Browsers clear a type="search" field natively on Esc; `search` is the event
  // that always follows, so the filter never outlives the text in the box.
  input.addEventListener('search', function () { applyFilter(input.value); });

  clearBtn.addEventListener('click', function () {
    input.value = '';
    applyFilter('');
    input.focus();
  });

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var active = chip.getAttribute('aria-pressed') === 'true';
      input.value = active ? '' : chip.dataset.term;
      applyFilter(input.value);
    });
  });

  /* ---- Copy contact details --------------------------------- */

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); }
      catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }

  document.querySelectorAll('.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(btn.dataset.copy).then(function () {
        btn.classList.add('is-done');
        announce('Copied ' + btn.dataset.copy);
        setTimeout(function () { btn.classList.remove('is-done'); }, 1400);
      }).catch(function () {
        announce('Could not copy — ' + btn.dataset.copy);
      });
    });
  });

  /* ---- Print ------------------------------------------------ */

  document.getElementById('print').addEventListener('click', function () { window.print(); });

  /* ---- Keyboard shortcuts ----------------------------------- */

  document.addEventListener('keydown', function (event) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

    if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      input.focus();
      input.select();
      return;
    }

    // `activeTerm` matters as well as the field: Esc may have blanked the
    // field natively before this listener ran.
    if (event.key === 'Escape' && (input.value || activeTerm)) {
      input.value = '';
      applyFilter('');
    }
  });
})();
