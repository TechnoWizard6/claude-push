// Leads-Track engagement SDK — included on every microsite.
// Captures: page views, section views (pricing / floor plans / ...), scroll
// depth, time spent, brochure downloads, return visits, device info.
(function () {
  var token = document.body.getAttribute('data-token');
  if (!token) return;

  var device = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  var source = new URLSearchParams(location.search).get('utm_source') || document.referrer.replace(/^https?:\/\/([^/]+).*$/, '$1') || 'direct';

  // One session id per browser tab-session; visit counting across sessions
  var sessionId = sessionStorage.getItem('lt_session');
  var isNewSession = !sessionId;
  if (isNewSession) {
    sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('lt_session', sessionId);
  }

  function send(events, useBeacon) {
    var payload = JSON.stringify({ token: token, events: events });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () {});
    }
  }

  function ev(name, extra) {
    var e = { event: name, device: device, session_id: sessionId, source: source };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }

  // --- Page view (a repeat session registers as a return visit server-side) ---
  send([ev('page_view')]);

  // --- Section views via IntersectionObserver (fire once per section) ---
  var SECTION_EVENTS = {
    pricing: 'pricing_view',
    floor_plans: 'floor_plan_view',
    unit_config: 'unit_config_view'
  };
  var seen = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var section = entry.target.getAttribute('data-track-section');
        if (seen[section]) return;
        seen[section] = true;
        send([ev(SECTION_EVENTS[section] || 'section_view', { section: section })]);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-track-section]').forEach(function (el) { io.observe(el); });
  }

  // --- Scroll depth (25% steps, only the max is sent per step) ---
  var maxDepth = 0;
  window.addEventListener('scroll', function () {
    var h = document.documentElement;
    var depth = Math.round(((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100);
    var step = Math.min(Math.floor(depth / 25) * 25, 100);
    if (step > maxDepth) {
      maxDepth = step;
      send([ev('scroll', { scroll_depth: step })]);
    }
  }, { passive: true });

  // --- Time spent: heartbeat every 15s while the tab is visible ---
  var alive = 0;
  setInterval(function () {
    if (document.visibilityState === 'visible') {
      alive += 15;
      send([ev('time_spent', { duration: 15 })]);
    }
  }, 15000);

  // --- Flush a final time-slice when the user leaves ---
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && alive % 15 !== 0) {
      send([ev('time_spent', { duration: alive % 15 })], true);
    }
  });

  // --- Explicit interactions: brochure download links, share buttons ---
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (!el) return;
    var name = el.getAttribute('data-track');
    // brochure_download is logged server-side on the download route; don't double count
    if (name && name !== 'brochure_download') send([ev(name)]);
  });
})();
