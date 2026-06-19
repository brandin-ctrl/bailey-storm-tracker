'use strict';

// ═══════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════
const CENTER = { lat: 34.1290, lng: -84.0200 };
const HAIL_THRESHOLD = 0.75;   // lowered from 1.00
const WIND_THRESHOLD = 45;
const SEARCH_RADIUS_MILES = 1.0;

// Severity tiers for verdict logic
// SEVERE: golf ball+ hail (1.75"+) OR wind 75+ mph → CALL US TODAY
// QUALIFIES: any hail 0.75"+ OR wind 45+ mph within window → book inspection
// MONITOR: events exist but outside 2yr window (informational only)

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
    // Keep ALL events in memory — window filtering happens at search/render time
    // so we can show "outside window" events as informational in address results
    HAIL = (json.hail_events || []);
    WIND = (json.wind_events || []);
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
  if (sz >= 1.00) return '#D4B84A';
  return '#7DB87A'; // 0.75"–0.99" — green, below standard but trackable
}

function hailSizeClass(sz) {
  if (sz >= 2.00) return 'sp-purple';
  if (sz >= 1.75) return 'sp-red';
  if (sz >= 1.50) return 'sp-orange';
  if (sz >= 1.00) return 'sp-yellow';
  return 'sp-green';
}

function hailCategory(sz) {
  if (sz >= 2.00) return 'Extreme / Baseball';
  if (sz >= 1.75) return 'Golf Ball';
  if (sz >= 1.50) return 'Ping-Pong';
  if (sz >= 1.00) return 'Quarter';
  return 'Dime / Marble';
}

function renderMap() {
  hailLayers.forEach(l => map.removeLayer(l));
  windLayers.forEach(l => map.removeLayer(l));
  hailLayers = [];
  windLayers = [];

  const f = activeFilter;
  const yr = f === 'y2025' ? 2025 : f === 'y2026' ? 2026 : null;

  // Wind circles — only in-window events on map
  if (f !== 'hail' && f !== 'golf') {
    WIND.filter(ev => inWindow(ev.date)).forEach(ev => {
      if (yr && new Date(ev.date + 'T00:00:00').getFullYear() !== yr) return;

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

  // Hail pins — only in-window events on map
  if (f !== 'wind') {
    HAIL.filter(ev => inWindow(ev.date)).forEach(ev => {
      if (yr && new Date(ev.date + 'T00:00:00').getFullYear() !== yr) return;
      if (f === 'golf' && ev.size_in < 1.75) return;

      const radius = 6 + (ev.size_in - 0.75) * 6;
      const dot = L.circleMarker([ev.lat, ev.lng], {
        radius: Math.max(6, radius),
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

  const isExtreme = ev.size_in >= 1.75;
  const isMod = ev.size_in >= 1.50;
  const isMinor = ev.size_in < 1.00;

  document.getElementById('canvass-action').textContent =
    isExtreme ? 'HIGH PRIORITY — Golf ball+ hail causes near-certain damage. Canvas this area immediately.'
    : isMod ? 'MEDIUM PRIORITY — Likely damage to older roofs and 3-tab shingles. Good canvassing opportunity.'
    : isMinor ? 'LOW — Sub-inch hail. Worth canvassing homes with aging roofs (15+ years) or previous damage.'
    : 'MODERATE — Quarter-size hail. Worth canvassing homes with aging roofs (15+ years).';

  document.getElementById('canvass-script').innerHTML =
    '"Hi, I\u2019m with Bailey Roofing and Restoration, locally based right here in Buford. Our storm tracker showed '
    + ev.size_in + '" hail hit ' + ev.city + ' on ' + fmtDate(ev.date)
    + '. We\u2019re doing free inspections in this neighborhood this week \u2014 it only takes 30 minutes and there\u2019s no obligation. Would you like us to take a look at your roof?"';

  document.getElementById('canvass-lookfor').textContent =
    'Look for: granule loss in gutters/downspouts, dents on AC units and vents, cracked or missing shingles, dented gutters and fascia. '
    + (isExtreme ? 'Golf ball hail almost always leaves visible bruising on shingles.'
      : isMinor ? 'Sub-inch hail may only show granule loss in downspouts — still worth inspecting.'
      : 'Quarter-size damage may require getting on the roof to confirm.');

  const qualifies = inWindow(ev.date) && ev.size_in >= HAIL_THRESHOLD;
  const ivEl = document.getElementById('ins-verdict');
  if (qualifies && isExtreme) {
    ivEl.style.cssText = 'background:rgba(224,82,82,0.12);color:#E05252;border:1px solid rgba(224,82,82,0.3)';
    ivEl.innerHTML = '\u26a0\ufe0f SEVERE — Homes in this area should call Bailey today.';
  } else if (qualifies) {
    ivEl.style.cssText = 'background:rgba(76,175,125,0.1);color:#4CAF7D;border:1px solid rgba(76,175,125,0.25)';
    ivEl.innerHTML = '\u2713 Homes in this area likely qualify for an insurance inspection.';
  } else {
    ivEl.style.cssText = 'background:rgba(247,242,234,0.06);color:rgba(247,242,234,0.5);border:1px solid rgba(247,242,234,0.1)';
    ivEl.innerHTML = 'Outside 2-year window or below damage threshold.';
  }

  document.getElementById('ins-detail').innerHTML =
    'Hail size: <strong style="color:#F7F2EA">' + ev.size_in + '" (' + hailCategory(ev.size_in) + ')</strong><br>'
    + 'Date: <strong style="color:#F7F2EA">' + fmtDate(ev.date) + '</strong><br>'
    + 'Tracking threshold: \u22650.75" (insurers typically use 1.00"+)<br>'
    + 'Estimated homes affected: <strong style="color:#F7F2EA">' + (ev.estimated_homes || 0).toLocaleString() + '</strong><br>'
    + (ev.notes ? '<br><em style="color:rgba(247,242,234,0.4)">' + ev.notes + '</em>' : '');

  switchTab('canvass', document.querySelector('.ptab'));
  map.setView([ev.lat, ev.lng], 13);
}

function showWindPanel(ev) {
  showPanel('panel-wind');
  document.getElementById('wind-location').textContent = ev.city + ' \u2014 Wind Event';
  document.getElementById('wind-county').textContent = ev.county + ' County \u2022 ' + fmtDate(ev.date);
  document.getElementById('wind-mph').textContent = ev.mph + ' mph';
  document.getElementById('wind-date').textContent = fmtDate(ev.date).replace(/,\s\d{4}/, '');
  document.getElementById('wind-homes').textContent = (ev.estimated_homes || 0).toLocaleString();

  const isSevere = ev.mph >= 75;
  const exceeds = ev.mph >= 60;

  document.getElementById('wind-info').innerHTML =
    '<strong style="color:#C8A45A">3-Tab Shingle Threshold:</strong> '
    + (ev.mph >= WIND_THRESHOLD ? '\u26a0\ufe0f Exceeds ' + WIND_THRESHOLD + ' mph minimum' : 'Below threshold') + '<br><br>'
    + '<strong style="color:#C8A45A">Damage Likelihood:</strong> '
    + (isSevere ? 'SEVERE \u2014 75+ mph winds cause near-certain shingle separation, flashing damage, and possible decking exposure. Call Bailey today.'
      : exceeds ? 'High \u2014 winds over 60 mph can lift and separate shingles, expose decking, and damage flashing.'
      : 'Moderate \u2014 winds 45\u201360 mph can unseat 3-tab shingles, especially on aging or previously damaged roofs.') + '<br><br>'
    + '<strong style="color:#C8A45A">Coverage Radius:</strong> Approximately ' + (ev.radius_miles || 6) + ' miles<br><br>'
    + (ev.notes ? '<em style="color:rgba(247,242,234,0.4)">' + ev.notes + '</em><br><br>' : '')
    + '<strong style="color:#C8A45A">Insurance Canvassing:</strong> Wind events at this speed are worth inspecting, especially for homes with 3-tab shingles or roofs over 10 years old.';

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

// KEY FIX: wind check uses the event's radius_miles, not SEARCH_RADIUS_MILES
// If address is within the wind circle's stated radius → it was in the affected area
function addressInWindEvent(addrLat, addrLng, ev) {
  const dist = distMiles(addrLat, addrLng, ev.lat, ev.lng);
  return dist <= (ev.radius_miles || 6);
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

    if (searchLayer) searchLayer.forEach(l => map.removeLayer(l));
    searchLayer = [];

    const pin = L.circleMarker([lat, lng], {
      radius: 10, color: '#C8A45A', fillColor: '#C8A45A', fillOpacity: 0.95, weight: 3
    }).bindPopup('<strong style="color:#1A1410;font-family:Lato,sans-serif">Your address</strong>').openPopup();
    pin.addTo(map);
    searchLayer.push(pin);

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

    // HAIL: address within 1 mile of the storm center (hail events are point events)
    const nearHail = HAIL
      .filter(e => distMiles(lat, lng, e.lat, e.lng) <= SEARCH_RADIUS_MILES)
      .sort((a,b) => new Date(b.date) - new Date(a.date));

    // WIND: address falls INSIDE the wind event's radius circle (area event)
    const nearWind = WIND
      .filter(e => addressInWindEvent(lat, lng, e))
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

  // Split into in-window and out-of-window
  const hailInWindow  = nearHail.filter(e => inWindow(e.date));
  const windInWindow  = nearWind.filter(e => inWindow(e.date));
  const hailHistoric  = nearHail.filter(e => !inWindow(e.date));
  const windHistoric  = nearWind.filter(e => !inWindow(e.date));

  const totalQualifying = hailInWindow.length + windInWindow.length;
  const largest = hailInWindow.length ? Math.max(...hailInWindow.map(e => e.size_in)) : null;
  const highestWind = windInWindow.length ? Math.max(...windInWindow.map(e => e.mph)) : null;

  // Severity tiers
  const isSevere = (largest && largest >= 1.75) || (highestWind && highestWind >= 75);
  const qualifies = totalQualifying > 0;

  const shortAddr = addr.length > 38 ? addr.substring(0, 36) + '\u2026' : addr;
  document.getElementById('addr-label').textContent = shortAddr;

  // Verdict badge — three tiers
  const badge = document.getElementById('addr-verdict-badge');
  if (isSevere) {
    badge.className = 'addr-verdict verdict-severe';
    badge.innerHTML = '\u26a0\ufe0f SEVERE DAMAGE AREA \u2014 Call Us Today';
  } else if (qualifies) {
    badge.className = 'addr-verdict verdict-yes';
    badge.innerHTML = '\u2713 Likely Qualifies for Insurance Inspection';
  } else if (hailHistoric.length || windHistoric.length) {
    badge.className = 'addr-verdict verdict-monitor';
    badge.innerHTML = '\u23f0 Prior Storm History \u2014 Outside Claim Window';
  } else {
    badge.className = 'addr-verdict verdict-no';
    badge.innerHTML = 'No Qualifying Events Found';
  }

  document.getElementById('addr-hail-count').textContent = hailInWindow.length;
  document.getElementById('addr-wind-count').textContent = windInWindow.length;
  document.getElementById('addr-largest').textContent = largest ? largest + '"' : '\u2014';

  // Severe callout block
  let html = '';
  if (isSevere) {
    html += '<div style="background:rgba(224,82,82,0.12);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:12px 14px;margin-bottom:14px;">'
      + '<div style="color:#E05252;font-weight:700;font-size:13px;margin-bottom:6px">\u26a0\ufe0f Severe Damage Detected</div>'
      + '<div style="color:rgba(247,242,234,0.8);font-size:12px;line-height:1.6">'
      + (largest >= 1.75 ? 'Golf ball+ hail (' + largest + '") hit within 1 mile of your address. ' : '')
      + (highestWind >= 75 ? 'Wind speeds of ' + highestWind + ' mph were recorded in your area. ' : '')
      + 'This level of storm activity almost always causes insurance-claimable damage. <strong style="color:#E05252">Call Bailey Roofing today at (770) 381-8081</strong> — don\'t wait.'
      + '</div></div>';
  }

  // In-window hail events
  if (hailInWindow.length) {
    html += '<div class="feed-section-label">Hail Events Within 1 Mile (2-yr window)</div>';
    hailInWindow.slice(0, 6).forEach(ev => {
      html += '<div class="feed-row">'
        + '<span class="feed-date">' + fmtDate(ev.date) + '</span>'
        + '<span class="feed-detail">' + ev.city + '</span>'
        + '<span class="size-pill ' + hailSizeClass(ev.size_in) + '">' + ev.size_in + '"</span>'
        + '</div>';
    });
    if (hailInWindow.length > 6) {
      html += '<div class="feed-row" style="justify-content:center"><span style="font-size:11px;color:var(--muted)">+ ' + (hailInWindow.length - 6) + ' more hail events</span></div>';
    }
  }

  // In-window wind events
  if (windInWindow.length) {
    html += '<div class="feed-section-label" style="margin-top:10px">Wind Events in Your Area (2-yr window)</div>';
    windInWindow.slice(0, 4).forEach(ev => {
      html += '<div class="feed-row">'
        + '<span class="feed-date">' + fmtDate(ev.date) + '</span>'
        + '<span class="feed-detail">' + ev.city + ' \u2022 ' + ev.mph + ' mph</span>'
        + '<span class="size-pill sp-wind">' + (ev.mph >= 75 ? 'Severe' : ev.mph >= 60 ? 'High' : 'Mod') + '</span>'
        + '</div>';
    });
  }

  // Historic events (outside 2yr window — informational)
  if (!qualifies && (hailHistoric.length || windHistoric.length)) {
    html += '<div class="feed-section-label" style="margin-top:10px;color:rgba(247,242,234,0.35)">Prior Storm History (outside claim window)</div>';
    [...hailHistoric.slice(0,3), ...windHistoric.slice(0,2)].forEach(ev => {
      const isHail = ev.size_in !== undefined;
      html += '<div class="feed-row" style="opacity:0.45">'
        + '<span class="feed-date">' + fmtDate(ev.date) + '</span>'
        + '<span class="feed-detail">' + ev.city + (isHail ? '' : ' \u2022 ' + ev.mph + ' mph') + '</span>'
        + '<span class="size-pill ' + (isHail ? hailSizeClass(ev.size_in) : 'sp-wind') + '">' + (isHail ? ev.size_in + '"' : 'Wind') + '</span>'
        + '</div>';
    });
    html += '<div style="font-size:11px;color:rgba(247,242,234,0.35);padding:6px 0 2px">These events are outside the typical 2-year claim window.</div>';
  }

  // No events at all
  if (!qualifies && !hailHistoric.length && !windHistoric.length) {
    html += '<div style="text-align:center;padding:20px 0;color:var(--muted);font-size:13px">No storm events found near this address in our database.<br><br>A preventive inspection is still recommended for any roof over 10 years old.</div>';
  }

  document.getElementById('addr-events-feed').innerHTML = html;

  // CTA button text varies by tier
  const ctaBtn = document.getElementById('addr-cta-btn');
  if (isSevere) {
    ctaBtn.textContent = '\u26a0\ufe0f Call Us Today \u2014 Severe Damage Area';
    ctaBtn.style.background = '#E05252';
    ctaBtn.onclick = function() { window.location.href = 'tel:+17703818081'; };
  } else if (qualifies) {
    ctaBtn.textContent = 'Book My Free Inspection \u2192';
    ctaBtn.style.background = '#C8A45A';
    ctaBtn.onclick = openBaileyPopup;
  } else {
    ctaBtn.textContent = 'Schedule a Preventive Inspection \u2192';
    ctaBtn.style.background = '#C8A45A';
    ctaBtn.onclick = openBaileyPopup;
  }
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
// QUICK STATS
// ═══════════════════════════════════════════════════════
function buildQuickStats() {
  const hailInWindow = HAIL.filter(e => inWindow(e.date));
  const windInWindow = WIND.filter(e => inWindow(e.date));
  const golfBall = hailInWindow.filter(e => e.size_in >= 1.75).length;
  const counties = [...new Set([...hailInWindow.map(e => e.county), ...windInWindow.map(e => e.county)])].length;

  document.getElementById('quick-stats').innerHTML = `
    <div class="qs-row"><span class="qs-label">Hail events \u22650.75" (2yr window)</span><span class="qs-val">${hailInWindow.length}</span></div>
    <div class="qs-row"><span class="qs-label">Wind events \u226545 mph</span><span class="qs-val">${windInWindow.length}</span></div>
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
// INSPECTION FORM — uses Formspree mojzzlzd
// ═══════════════════════════════════════════════════════
function openInspectionForm(context) {
  // If inside Webflow iframe, trigger baileyPopup instead
  if (window.self !== window.top) {
    try {
      if (window.parent.baileyPopup && window.parent.baileyPopup.open) {
        window.parent.baileyPopup.open();
        return;
      }
    } catch(e) {}
  }
  // Otherwise open built-in modal
  const modal = document.getElementById('inspection-modal');
  if (modal) {
    modal.classList.add('open');
    if (context) document.getElementById('form-storm-context').value = context;
  }
}

function closeInspectionForm() {
  document.getElementById('inspection-modal').classList.remove('open');
}

function closeFormIfOutside(e) {
  if (e.target === document.getElementById('inspection-modal')) closeInspectionForm();
}

// Handle Formspree submission
document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('inspection-form');
  if (!form) return;
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = form.querySelector('.form-submit');
    btn.textContent = 'Sending\u2026';
    btn.disabled = true;
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        form.style.display = 'none';
        document.getElementById('form-success').classList.remove('hidden');
      } else {
        btn.textContent = 'Try again';
        btn.disabled = false;
      }
    } catch(err) {
      btn.textContent = 'Try again';
      btn.disabled = false;
    }
  });
});

// Replace old openBaileyPopup calls — alias for backwards compat
function openBaileyPopup() { openInspectionForm(); }

// ═══════════════════════════════════════════════════════
// ENTER KEY
// ═══════════════════════════════════════════════════════
document.getElementById('address-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchAddress();
});

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
initMap();
