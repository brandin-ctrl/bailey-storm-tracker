'use strict';

// ═══════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════
const CENTER = { lat: 34.1290, lng: -84.0200 };
const HAIL_THRESHOLD = 1.00;
const WIND_THRESHOLD = 45;
const SEARCH_RADIUS_MILES = 1.0;

// ═══════════════════════════════════════════════════════
// ROLLING 2-YEAR WINDOW
// ═══════════════════════════════════════════════════════
function getWindow() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 2);
  return { start, end };
}

function inWindow(dateStr) {
  const { start, end } = getWindow();
  const d = new Date(dateStr + 'T00:00:00');
  return d >= start && d <= end;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtWindowLabel() {
  const { start, end } = getWindow();
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return fmt(start) + ' \u2013 ' + fmt(end);
}

// ═══════════════════════════════════════════════════════
// DATA LOAD
// ═══════════════════════════════════════════════════════
let HAIL = [], WIND = [];

async function loadData() {
  try {
    const res = await fetch('data.json?v=' + Date.now());
    const json = await res.json();
    HAIL = (json.hail_events || []).filter(e => inWindow(e.date));
    WIND = (json.wind_events || []).filter(e => inWindow(e.date));
    document.getElementById('window-label').textContent = 'Coverage: ' + fmtWindowLabel();
    buildQuickStats();
    renderMap();
  } catch(e) {
    console.error('Failed to load data.json:', e);
    document.getElementById('window-label').textContent = 'Data load error — check console';
  }
}

// ═══════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════
let map, hailLayers = [], windLayers = [], searchLayer = null;
let activeFilter = 'all';

function initMap() {
  map = L.map('map', {
    center: [CENTER.lat, CENTER.lng],
    zoom: 10,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  loadData();
}

function hailColor(sz) {
  if (sz >= 2.00) return '#9B72CF';
  if (sz >= 1.75) return '#E05252';
  if (sz >= 1.50) return '#E07B30';
  return '#D4B84A';
}

function hailSizeClass(sz) {
  if (sz >= 2.00) return 'sp-purple';
  if (sz >= 1.75) return 'sp-red';
  if (sz >= 1.50) return 'sp-orange';
  return 'sp-yellow';
}

function hailCategory(sz) {
  if (sz >= 2.00) return 'Extreme';
  if (sz >= 1.75) return 'Golf Ball';
  if (sz >= 1.50) return 'Ping-Pong';
  return 'Quarter';
}

function renderMap() {
  hailLayers.forEach(l => map.removeLayer(l));
  windLayers.forEach(l => map.removeLayer(l));
  hailLayers = [];
  windLayers = [];

  const f = activeFilter;
  const yr = f === 'y2025' ? 2025 : f === 'y2026' ? 2026 : null;

  // Wind circles (behind hail dots)
  if (f !== 'hail' && f !== 'golf' && f !== 'y2025' && f !== 'y2026' || f === 'wind') {
    WIND.forEach(ev => {
      if (yr && new Date(ev.date + 'T00:00:00').getFullYear() !== yr) return;
      if (f === 'hail') return;
      if (f === 'golf') return;

      const radiusMeters = (ev.radius_miles || 6) * 1609.34;
      const circle = L.circle([ev.lat, ev.lng], {
        radius: radiusMeters,
        color: 'rgba(200,164,90,0.55)',
        fillColor: 'rgba(200,164,90,0.08)',
        fillOpacity: 1,
        weight: 1.5,
        dashArray: '5,4'
      });

      circle.on('click', () => showWindPanel(ev));
      circle.addTo(map);
      windLayers.push(circle);
    });
  }

  // Hail pins
  if (f !== 'wind') {
    HAIL.forEach(ev => {
      if (yr && new Date(ev.date + 'T00:00:00').getFullYear() !== yr) return;
      if (f === 'golf' && ev.size_in < 1.75) return;

      const radius = 7 + (ev.size_in - 1.0) * 7;
      const dot = L.circleMarker([ev.lat, ev.lng], {
        radius,
        color: hailColor(ev.size_in),
        fillColor: hailColor(ev.size_in),
        fillOpacity: 0.78,
        weight: 1.5
      });

      dot.on('click', () => showHailPanel(ev));
      dot.addTo(map);
      hailLayers.push(dot);
    });
  }
}

// ═══════════════════════════════════════════════════════
// PANEL STATES
// ═══════════════════════════════════════════════════════
function showPanel(id) {
  ['panel-default', 'panel-hail', 'panel-wind', 'panel-address'].forEach(pid => {
    document.getElementById(pid).classList.toggle('hidden', pid !== id);
  });
}

function showDefaultPanel() {
  showPanel('panel-default');
  if (searchLayer) {
    searchLayer.forEach(l => map.removeLayer(l));
    searchLayer = null;
  }
  map.setView([CENTER.lat, CENTER.lng], 10);
}

function showHailPanel(ev) {
  showPanel('panel-hail');

  const tag = document.getElementById('hail-tag');
  tag.textContent = 'Hail \u2014 ' + hailCategory(ev.size_in);
  tag.className = 'event-type-tag hail-tag';

  document.getElementById('hail-neighborhood').textContent = ev.neighborhood;
  document.getElementById('hail-city-county').textContent = ev.city + ', ' + ev.county + ' County \u2022 ' + fmtDate(ev.date);
  document.getElementById('hail-size').textContent = ev.size_in + '"';
  document.getElementById('hail-date').textContent = fmtDate(ev.date).replace(/,\s\d{4}/, '');
  document.getElementById('hail-homes').textContent = (ev.estimated_homes || 0).toLocaleString();

  // Canvass tab
  const isHigh = ev.size_in >= 1.75;
  const isMod = ev.size_in >= 1.50;
  document.getElementById('canvass-action').textContent =
    isHigh ? 'HIGH PRIORITY — Golf ball+ hail causes near-certain damage. Canvas this area immediately.'
    : isMod ? 'MEDIUM PRIORITY — Likely damage to older roofs and 3-tab shingles. Good canvassing opportunity.'
    : 'MODERATE — Quarter-size hail. Worth canvassing homes with aging roofs (15+ years).';

  document.getElementById('canvass-script').innerHTML =
    '"Hi, I\u2019m with Bailey Roofing and Restoration, locally based right here in Buford. Our storm tracker showed '
    + ev.size_in + ' inch hail hit ' + ev.city + ' on ' + fmtDate(ev.date) + '. We\u2019re doing free inspections in this neighborhood this week \u2014 it only takes 30 minutes and there\u2019s no obligation. Would you like us to take a look at your roof?"';

  document.getElementById('canvass-lookfor').textContent =
    'Look for: granule loss in gutters/downspouts, dents on AC units and vents, cracked or missing shingles, dented gutters and fascia. '
    + (isHigh ? 'Golf ball hail almost always leaves visible bruising on shingles.' : 'Quarter-size damage may require getting on the roof to confirm.');

  // Insurance tab
  const qualifies = inWindow(ev.date) && ev.size_in >= HAIL_THRESHOLD;
  const ivEl = document.getElementById('ins-verdict');
  if (qualifies) {
    ivEl.className = 'ins-verdict';
    ivEl.style.cssText = 'background:rgba(76,175,125,0.1);color:#4CAF7D;border:1px solid rgba(76,175,125,0.25)';
    ivEl.innerHTML = '\u2713 Homes in this area likely qualify for an insurance inspection.';
  } else {
    ivEl.className = 'ins-verdict';
    ivEl.style.cssText = 'background:rgba(247,242,234,0.06);color:rgba(247,242,234,0.5);border:1px solid rgba(247,242,234,0.1)';
    ivEl.innerHTML = 'Outside 2-year window or below damage threshold.';
  }

  document.getElementById('ins-detail').innerHTML =
    'Hail size: <strong style="color:#F7F2EA">' + ev.size_in + '"</strong> (' + hailCategory(ev.size_in) + ')<br>'
    + 'Date: <strong style="color:#F7F2EA">' + fmtDate(ev.date) + '</strong><br>'
    + 'Insurance threshold: \u22651.00" within 2 years<br>'
    + 'Estimated homes affected: <strong style="color:#F7F2EA">' + (ev.estimated_homes || 0).toLocaleString() + '</strong><br>'
    + (ev.notes ? '<br><em style="color:rgba(247,242,234,0.4)">' + ev.notes + '</em>' : '');

  // Reset to first tab
  switchTab('canvass', document.querySelector('.ptab'));
  map.setView([ev.lat, ev.lng], 13);
}

function showWindPanel(ev) {
  showPanel('panel-wind');
  document.getElementById('wind-location').textContent = ev.city + ' — Wind Event';
  document.getElementById('wind-county').textContent = ev.county + ' County \u2022 ' + fmtDate(ev.date);
  document.getElementById('wind-mph').textContent = ev.mph + ' mph';
  document.getElementById('wind-date').textContent = fmtDate(ev.date).replace(/,\s\d{4}/, '');
  document.getElementById('wind-homes').textContent = (ev.estimated_homes || 0).toLocaleString();

  const exceeds = ev.mph >= 60;
  document.getElementById('wind-info').innerHTML =
    '<strong style="color:#C8A45A">3-Tab Shingle Threshold:</strong> ' + (ev.mph >= WIND_THRESHOLD ? '\u26a0\ufe0f Exceeds ' + WIND_THRESHOLD + ' mph minimum' : 'Below 45 mph threshold') + '<br><br>'
    + '<strong style="color:#C8A45A">Damage Likelihood:</strong> '
    + (exceeds ? 'High \u2014 winds over 60 mph can lift and separate shingles, expose decking, and damage flashing.'
      : 'Moderate \u2014 winds 45\u201360 mph can unseat 3-tab shingles, especially on aging roofs.') + '<br><br>'
    + '<strong style="color:#C8A45A">Coverage Radius:</strong> Approximately ' + (ev.radius_miles || 6) + ' miles<br><br>'
    + (ev.notes ? '<em style="color:rgba(247,242,234,0.4)">' + ev.notes + '</em>' : '')
    + '<br><br><strong style="color:#C8A45A">Insurance Canvassing:</strong> Wind events at this speed are worth inspecting, especially for homes with 3-tab shingles or roofs over 10 years old.';

  map.setView([ev.lat, ev.lng], 11);
}

// ═══════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════
function switchTab(tabId, btn) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.ptab-content').forEach(c => c.classList.add('hidden'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('tab-' + tabId);
  if (el) el.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════
// ADDRESS SEARCH
// ═══════════════════════════════════════════════════════
function toRad(d) { return d * Math.PI / 180; }
function distMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function searchAddress() {
  const raw = document.getElementById('address-input').value.trim();
  if (!raw) return;

  const btn = document.querySelector('.search-btn');
  btn.textContent = 'Searching\u2026';
  btn.disabled = true;

  try {
    const q = encodeURIComponent(raw + ', Georgia USA');
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + q + '&limit=1&countrycodes=us', {
      headers: { 'Accept-Language': 'en' }
    });
    const data = await res.json();

    if (!data.length) {
      alert('Address not found. Please try including your city and GA zip code (e.g. "123 Oak St, Suwanee GA 30024").');
      btn.textContent = 'Check My Address';
      btn.disabled = false;
      return;
    }

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    // Clear old search layers
    if (searchLayer) searchLayer.forEach(l => map.removeLayer(l));
    searchLayer = [];

    // Address pin
    const pin = L.circleMarker([lat, lng], {
      radius: 10, color: '#C8A45A', fillColor: '#C8A45A', fillOpacity: 0.95, weight: 3
    }).bindPopup('<strong style="color:#1A1410;font-family:Lato,sans-serif">Your address</strong>').openPopup();
    pin.addTo(map);
    searchLayer.push(pin);

    // 1-mile radius ring
    const ring = L.circle([lat, lng], {
      radius: 1609.34,
      color: 'rgba(200,164,90,0.45)',
      fillColor: 'rgba(200,164,90,0.04)',
      weight: 1.5,
      dashArray: '6,4'
    });
    ring.addTo(map);
    searchLayer.push(ring);

    map.setView([lat, lng], 13);

    // Find nearby events
    const nearHail = HAIL.filter(e => distMiles(lat, lng, e.lat, e.lng) <= SEARCH_RADIUS_MILES)
      .sort((a,b) => new Date(b.date) - new Date(a.date));
    const nearWind = WIND.filter(e => distMiles(lat, lng, e.lat, e.lng) <= SEARCH_RADIUS_MILES)
      .sort((a,b) => new Date(b.date) - new Date(a.date));

    showAddressPanel(raw, lat, lng, nearHail, nearWind);

  } catch(err) {
    alert('Search failed. Please check your connection and try again.');
    console.error(err);
  }

  btn.textContent = 'Check My Address';
  btn.disabled = false;
}

function showAddressPanel(addr, lat, lng, nearHail, nearWind) {
  showPanel('panel-address');

  const total = nearHail.length + nearWind.length;
  const qualifies = total > 0;
  const largest = nearHail.length ? Math.max(...nearHail.map(e => e.size_in)) : null;

  // Short address for display
  const shortAddr = addr.length > 38 ? addr.substring(0, 36) + '\u2026' : addr;
  document.getElementById('addr-label').textContent = shortAddr;

  const badge = document.getElementById('addr-verdict-badge');
  if (qualifies) {
    badge.className = 'addr-verdict verdict-yes';
    badge.innerHTML = '\u2713 Likely Qualifies for Insurance Inspection';
  } else {
    badge.className = 'addr-verdict verdict-no';
    badge.innerHTML = 'No Qualifying Events Within 1 Mile';
  }

  document.getElementById('addr-hail-count').textContent = nearHail.length;
  document.getElementById('addr-wind-count').textContent = nearWind.length;
  document.getElementById('addr-largest').textContent = largest ? largest + '"' : '\u2014';

  // Events feed
  let html = '';
  if (nearHail.length) {
    html += '<div class="feed-section-label">Hail Events Within 1 Mile</div>';
    nearHail.slice(0, 6).forEach(ev => {
      html += '<div class="feed-row">'
        + '<span class="feed-date">' + fmtDate(ev.date) + '</span>'
        + '<span class="feed-detail">' + ev.city + '</span>'
        + '<span class="size-pill ' + hailSizeClass(ev.size_in) + '">' + ev.size_in + '"</span>'
        + '</div>';
    });
    if (nearHail.length > 6) {
      html += '<div class="feed-row" style="justify-content:center"><span style="font-size:11px;color:var(--muted)">+ ' + (nearHail.length - 6) + ' more hail events</span></div>';
    }
  }

  if (nearWind.length) {
    html += '<div class="feed-section-label" style="margin-top:10px">Wind Events Within 1 Mile</div>';
    nearWind.slice(0, 4).forEach(ev => {
      html += '<div class="feed-row">'
        + '<span class="feed-date">' + fmtDate(ev.date) + '</span>'
        + '<span class="feed-detail">' + ev.city + ' \u2022 ' + ev.mph + ' mph</span>'
        + '<span class="size-pill sp-wind">' + (ev.mph >= 60 ? 'High' : 'Mod') + '</span>'
        + '</div>';
    });
  }

  if (!total) {
    html = '<div style="text-align:center;padding:20px 0;color:var(--muted);font-size:13px">No qualifying storm events found within 1 mile in the past 2 years.<br><br>A preventive inspection is still a smart move for any roof over 10 years old.</div>';
  }

  document.getElementById('addr-events-feed').innerHTML = html;

  const ctaBtn = document.getElementById('addr-cta-btn');
  ctaBtn.textContent = qualifies
    ? 'Book My Free Inspection \u2192'
    : 'Schedule a Preventive Inspection \u2192';
}

// ═══════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderMap();
  });
});

// ═══════════════════════════════════════════════════════
// QUICK STATS (default panel)
// ═══════════════════════════════════════════════════════
function buildQuickStats() {
  const hailCount = HAIL.length;
  const windCount = WIND.length;
  const golfBall = HAIL.filter(e => e.size_in >= 1.75).length;
  const counties = [...new Set([...HAIL.map(e => e.county), ...WIND.map(e => e.county)])].length;

  document.getElementById('quick-stats').innerHTML = `
    <div class="qs-row"><span class="qs-label">Hail events (2yr window)</span><span class="qs-val">${hailCount}</span></div>
    <div class="qs-row"><span class="qs-label">Wind events \u226545 mph</span><span class="qs-val">${windCount}</span></div>
    <div class="qs-row"><span class="qs-label">Golf ball+ events</span><span class="qs-val">${golfBall}</span></div>
    <div class="qs-row"><span class="qs-label">Counties with activity</span><span class="qs-val">${counties}</span></div>
    <div class="qs-row"><span class="qs-label">Coverage window</span><span class="qs-val" style="font-size:10px">${fmtWindowLabel()}</span></div>
  `;
}

// ═══════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════
function toggleFaq(btn) {
  const a = btn.nextElementSibling;
  const isOpen = a.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.faq-q').forEach(el => el.classList.remove('open'));
  if (!isOpen) { a.classList.add('open'); btn.classList.add('open'); }
}

// ═══════════════════════════════════════════════════════
// BAILEY POPUP
// ═══════════════════════════════════════════════════════
function openBaileyPopup() {
  if (window.parent && window.parent.baileyPopup && window.parent.baileyPopup.open) {
    window.parent.baileyPopup.open();
  } else if (typeof baileyPopup !== 'undefined' && baileyPopup.open) {
    baileyPopup.open();
  } else {
    window.open('https://calendly.com/brandin-baileyroofingrestoration/free-inspection', '_blank');
  }
}

// ═══════════════════════════════════════════════════════
// ENTER KEY on search
// ═══════════════════════════════════════════════════════
document.getElementById('address-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchAddress();
});

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
initMap();
