'use strict';

const CENTER = { lat: 34.1290, lng: -84.0200 };
const HAIL_THRESHOLD = 0.75;
const WIND_THRESHOLD = 45;
const SEARCH_RADIUS_MILES = 1.0;

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

let HAIL = [], WIND = [];

async function loadData() {
  try {
    const res = await fetch('data.json?v=' + Date.now());
    const json = await res.json();
    HAIL = json.hail_events || [];
    WIND = json.wind_events || [];
    document.getElementById('window-label').textContent = 'Coverage: ' + fmtWindowLabel();
    buildQuickStats();
    renderMap();
  } catch(e) {
    console.error('Failed to load data.json:', e);
    document.getElementById('window-label').textContent = 'Data load error';
  }
}

let map, hailLayers = [], windLayers = [], searchLayer = null;
let activeFilter = 'all';

function initMap() {
  map = L.map('map', { center: [CENTER.lat, CENTER.lng], zoom: 10, zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  loadData();
}

function hailColor(sz) {
  if (sz >= 2.00) return '#9B72CF';
  if (sz >= 1.75) return '#E05252';
  if (sz >= 1.50) return '#E07B30';
  if (sz >= 1.00) return '#D4B84A';
  return '#7DB87A';
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
  const yr = f === 'y2024' ? 2024 : f === 'y2025' ? 2025 : f === 'y2026' ? 2026 : null;

  if (f !== 'hail' && f !== 'golf') {
    WIND.filter(ev => inWindow(ev.date)).forEach(ev => {
      if (yr && new Date(ev.date + 'T00:00:00').getFullYear() !== yr) return;
      const circle = L.circle([ev.lat, ev.lng], {
        radius: (ev.radius_miles || 6) * 1609.34,
        color: 'rgba(200,164,90,0.55)', fillColor: 'rgba(200,164,90,0.08)', fillOpacity: 1, weight: 1.5, dashArray: '5,4'
      });
      circle.on('click', () => showWindPanel(ev));
      circle.addTo(map);
      windLayers.push(circle);
    });
  }

  if (f !== 'wind') {
    HAIL.filter(ev => inWindow(ev.date)).forEach(ev => {
      if (yr && new Date(ev.date + 'T00:00:00').getFullYear() !== yr) return;
      if (f === 'golf' && ev.size_in < 1.75) return;
      const dot = L.circleMarker([ev.lat, ev.lng], {
        radius: Math.max(6, 6 + (ev.size_in - 0.75) * 6),
        color: hailColor(ev.size_in), fillColor: hailColor(ev.size_in), fillOpacity: 0.78, weight: 1.5
      });
      dot.on('click', () => showHailPanel(ev));
      dot.addTo(map);
      hailLayers.push(dot);
    });
  }
}

function showPanel(id) {
  ['panel-default', 'panel-hail', 'panel-wind', 'panel-address'].forEach(pid => {
    document.getElementById(pid).classList.toggle('hidden', pid !== id);
  });
}

function showDefaultPanel() {
  showPanel('panel-default');
  if (searchLayer) { searchLayer.forEach(l => map.removeLayer(l)); searchLayer = null; }
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
  const isMod     = ev.size_in >= 1.50;
  const isMinor   = ev.size_in < 1.00;
  const qualifies = inWindow(ev.date) && ev.size_in >= HAIL_THRESHOLD;

  // — HOMEOWNER TAB —
  const ivEl = document.getElementById('ins-verdict');
  if (qualifies && isExtreme) {
    ivEl.style.cssText = 'background:rgba(224,82,82,0.12);color:#E05252;border:1px solid rgba(224,82,82,0.3)';
    ivEl.innerHTML = '\u26a0\ufe0f SEVERE EVENT \u2014 Your roof may need immediate attention. Call us today.';
  } else if (qualifies) {
    ivEl.style.cssText = 'background:rgba(76,175,125,0.1);color:#4CAF7D;border:1px solid rgba(76,175,125,0.25)';
    ivEl.innerHTML = '\u2713 This event is within the 2-year insurance claim window. Your home may qualify for a covered roof replacement.';
  } else {
    ivEl.style.cssText = 'background:rgba(247,242,234,0.06);color:rgba(247,242,234,0.5);border:1px solid rgba(247,242,234,0.1)';
    ivEl.innerHTML = 'This event is outside the typical 2-year insurance claim window.';
  }

  document.getElementById('homeowner-meaning').innerHTML =
    isExtreme
      ? ev.size_in + '" (' + hailCategory(ev.size_in) + ') hail hit ' + ev.city + ' on ' + fmtDate(ev.date) + '. Hail this size causes damage that almost always qualifies for a full insurance-covered roof replacement. The shingle granule layer is stripped, the mat underneath is cracked, and water works its way in over time — often well before you ever see a leak inside your home.'
      : isMod
      ? ev.size_in + '" (' + hailCategory(ev.size_in) + ') hail hit this area on ' + fmtDate(ev.date) + '. Ping-pong size hail causes significant granule loss and bruises the shingle mat. Older roofs and 3-tab shingles are especially vulnerable. Most insurance policies cover this size when reported within the 2-year window.'
      : isMinor
      ? ev.size_in + '" hail hit this area on ' + fmtDate(ev.date) + '. While smaller than the standard insurance threshold of 1.00", this event can accelerate wear on roofs over 15 years old or those with prior damage. A free inspection will tell you if your roof has been affected.'
      : ev.size_in + '" (' + hailCategory(ev.size_in) + ') hail hit ' + ev.city + ' on ' + fmtDate(ev.date) + '. Quarter-size hail is the minimum threshold most insurers recognize for storm damage claims. Damage isn\'t always visible from the ground — it takes a trained inspector on the roof to document what the adjuster needs to see.';

  document.getElementById('homeowner-signs').innerHTML =
    '<strong style="color:#C8A45A">Check these yourself right now:</strong><br>'
    + '\u2022 Gutters and downspouts \u2014 look for granule buildup or dents in the metal<br>'
    + '\u2022 AC unit on the side of your home \u2014 dents on the fins or casing<br>'
    + '\u2022 Window screens \u2014 small holes or punctures from impact<br>'
    + '\u2022 Mailbox and patio furniture \u2014 fresh dings or paint chips<br>'
    + '\u2022 Siding \u2014 small dimples or cracked areas<br>'
    + (isExtreme
      ? '\u2022 You may even see dark bruise spots on shingles from the ground with golf ball hail. Point these out to your adjuster.'
      : '\u2022 Roof surface damage often requires a trained eye on the roof to confirm \u2014 that\'s exactly what our free inspection covers.');

  document.getElementById('homeowner-process').innerHTML =
    '<strong style="color:#C8A45A">Step 1 \u2014 Free Inspection</strong><br>Bailey Roofing comes out, gets on the roof, and documents everything with photos and measurements. Zero cost to you, no strings attached.<br><br>'
    + '<strong style="color:#C8A45A">Step 2 \u2014 We work with your adjuster</strong><br>If there\'s a claim worth filing, we work directly with your insurance company. We make sure nothing gets missed in the scope of damage.<br><br>'
    + '<strong style="color:#C8A45A">Step 3 \u2014 New roof, you pay your deductible</strong><br>Once the claim is approved, your insurance covers the replacement. You pay only your deductible. We handle everything else.<br><br>'
    + '<em style="color:rgba(247,242,234,0.4)">Important: Most Georgia policies allow claims within 2 years of the storm date. '
    + (qualifies ? 'This event qualifies \u2014 but don\'t wait. Claims have deadlines.' : 'This event is near or outside that window. Call us to discuss your options.') + '</em>';

  // — REP TAB —
  document.getElementById('canvass-action').innerHTML =
    isExtreme
      ? '<span style="color:#E05252;font-weight:700">HIGH PRIORITY</span> \u2014 Golf ball+ hail causes near-certain insurance-claimable damage. Every home on this street is a potential job.'
      : isMod
      ? '<span style="color:#E07B30;font-weight:700">MEDIUM-HIGH</span> \u2014 Ping-pong hail hits older roofs and 3-tab shingles hard. Good conversion rate. Work the neighborhood thoroughly.'
      : isMinor
      ? '<span style="color:#D4B84A;font-weight:700">SELECTIVE</span> \u2014 Sub-inch hail. Focus on homes 15+ years old, visible granule loss, or roofs that already look worn.'
      : '<span style="color:#D4B84A;font-weight:700">MODERATE</span> \u2014 Quarter-size is the insurance threshold. Focus on homes that look aged or have existing wear showing.';

  document.getElementById('canvass-lookfor').innerHTML =
    '<strong style="color:#C8A45A">What to look for before you knock:</strong><br>'
    + '\u2022 Granules collected at the base of downspouts \u2014 strong confirmation<br>'
    + '\u2022 AC unit dents or crushed fins \u2014 easy to show the homeowner<br>'
    + '\u2022 Dented or misaligned gutters along the roofline<br>'
    + '\u2022 Damaged window screens visible from the driveway<br>'
    + (isExtreme ? '\u2022 Dark bruise spots or bare patches on shingles may be visible from the street with golf ball events.' : '\u2022 Most damage needs to be confirmed from the roof \u2014 lead with the free inspection offer.');

  document.getElementById('canvass-objection').innerHTML =
    '<strong style="color:#C8A45A">"I didn\'t see any damage"</strong><br>'
    + 'Hail damage is often invisible from the ground. It strips the granule layer that protects the shingle mat. Once that\'s gone, water works in slowly \u2014 leaks show up months later. The inspection documents what\'s there before it becomes a problem.<br><br>'
    + '<strong style="color:#C8A45A">"I don\'t want to file a claim"</strong><br>'
    + 'You don\'t commit to anything today. The inspection is free and shows you exactly what\'s there. A lot of homeowners decide to file once they see the photos of what hit their roof.<br><br>'
    + '<strong style="color:#C8A45A">"Will it raise my rates?"</strong><br>'
    + 'Hail and wind are Acts of God. This type of claim typically doesn\'t affect rates the same way an at-fault claim would \u2014 but that\'s a conversation to have with your agent. We can\'t advise on individual policies.';

  switchTab('homeowner', document.querySelector('#panel-hail .ptab'));
  map.setView([ev.lat, ev.lng], 13);
}

function showWindPanel(ev) {
  showPanel('panel-wind');
  document.getElementById('wind-location').textContent = ev.city + ' \u2014 Wind Event';
  document.getElementById('wind-county').textContent = ev.county + ' County \u2022 ' + fmtDate(ev.date);
  document.getElementById('wind-mph').textContent = ev.mph + ' mph';
  document.getElementById('wind-date').textContent = fmtDate(ev.date).replace(/,\s\d{4}/, '');
  document.getElementById('wind-homes').textContent = (ev.estimated_homes || 0).toLocaleString();

  const isSevere  = ev.mph >= 75;
  const isHigh    = ev.mph >= 60;
  const qualifies = inWindow(ev.date) && ev.mph >= WIND_THRESHOLD;

  // — HOMEOWNER WIND TAB —
  const wvEl = document.getElementById('wind-verdict');
  if (qualifies && isSevere) {
    wvEl.style.cssText = 'background:rgba(224,82,82,0.12);color:#E05252;border:1px solid rgba(224,82,82,0.3)';
    wvEl.innerHTML = '\u26a0\ufe0f SEVERE WIND EVENT \u2014 This level of wind causes significant roof damage. Call us today.';
  } else if (qualifies) {
    wvEl.style.cssText = 'background:rgba(76,175,125,0.1);color:#4CAF7D;border:1px solid rgba(76,175,125,0.25)';
    wvEl.innerHTML = '\u2713 This event exceeds the 45 mph threshold. Your home may qualify for a covered roof inspection.';
  } else {
    wvEl.style.cssText = 'background:rgba(247,242,234,0.06);color:rgba(247,242,234,0.5);border:1px solid rgba(247,242,234,0.1)';
    wvEl.innerHTML = 'This event is outside the typical 2-year insurance claim window.';
  }

  document.getElementById('wind-homeowner-meaning').innerHTML =
    ev.mph + ' mph winds hit ' + ev.city + ' on ' + fmtDate(ev.date) + ', covering approximately ' + (ev.radius_miles || 6) + ' miles. '
    + (isSevere
      ? 'Winds this strong cause near-certain shingle separation, lifted flashing, and in some cases exposed roof decking. If your home is in this area, there is a high likelihood of insurance-claimable damage that needs to be documented before it worsens.'
      : isHigh
      ? 'Winds above 60 mph can lift and separate asphalt shingles, damage flashing around chimneys and skylights, and loosen gutters. This level almost always causes some damage on roofs over 10 years old, even if it isn\'t obvious from the ground.'
      : '3-tab shingles are rated to about 60\u201370 mph, but many insurers use 45 mph as the threshold for older or weathered shingles. At ' + ev.mph + ' mph, shingles can be unseated, granules stripped, and edges lifted — allowing water under the shingle over time.');

  document.getElementById('wind-homeowner-signs').innerHTML =
    '<strong style="color:#C8A45A">Check these yourself:</strong><br>'
    + '\u2022 Missing shingles \u2014 look for bare patches on your roof from the ground or an upstairs window<br>'
    + '\u2022 Lifted shingle edges \u2014 corners or tabs curling upward<br>'
    + '\u2022 Gutters pulled away or sagging from the fascia<br>'
    + '\u2022 Missing or damaged ridge cap shingles along the peak of the roof<br>'
    + '\u2022 Granules or debris washed into your yard near downspouts after the storm<br>'
    + '\u2022 Gaps around your chimney, vents, or skylights where flashing may have lifted';

  document.getElementById('wind-homeowner-next').innerHTML =
    'Wind damage is progressive \u2014 a lifted shingle today becomes a leak in six months. The most important step is getting a licensed inspector on your roof before the damage gets worse or the insurance claim window closes.<br><br>'
    + '<strong style="color:#C8A45A">Bailey Roofing offers a free, no-obligation inspection.</strong> We document the damage with photos and measurements, walk you through exactly what we found, and handle the insurance process from start to finish if a claim is warranted.<br><br>'
    + 'You pay only your deductible. The inspection is always free.';

  // — REP WIND TAB —
  document.getElementById('wind-canvass-action').innerHTML =
    isSevere
      ? '<span style="color:#E05252;font-weight:700">HIGH PRIORITY</span> \u2014 75+ mph wind causes near-certain shingle damage. Every home in this ' + (ev.radius_miles || 6) + '-mile radius is worth hitting.'
      : isHigh
      ? '<span style="color:#E07B30;font-weight:700">MEDIUM-HIGH</span> \u2014 60+ mph winds. Focus on homes with 3-tab shingles or roofs over 10 years old. Strong conversion rate.'
      : '<span style="color:#D4B84A;font-weight:700">MODERATE</span> \u2014 45\u201360 mph. Worth hitting homes that show existing wear, granule loss, or older rooflines.';

  document.getElementById('wind-canvass-lookfor').innerHTML =
    '<strong style="color:#C8A45A">What to look for before you knock:</strong><br>'
    + '\u2022 Missing shingles visible from the street or driveway<br>'
    + '\u2022 Gutters sagging or pulled away from the fascia<br>'
    + '\u2022 Shingle tabs curled at the edges on the visible side of the roof<br>'
    + '\u2022 Ridge cap damage along the peak \u2014 first to go in high wind<br>'
    + '\u2022 Granule piles near downspouts left from the storm';

  document.getElementById('wind-canvass-objection').innerHTML =
    '<strong style="color:#C8A45A">"I don\'t see any damage"</strong><br>'
    + 'Wind damage is tricky. Lifted shingles reseal themselves in the summer heat but the bond is broken. Over time water gets under them. The inspection shows what\'s actually there before it turns into a leak.<br><br>'
    + '<strong style="color:#C8A45A">"I just had my roof done"</strong><br>'
    + 'New roofs can still be damaged by high winds, especially along the ridge and around flashing. Worth having it checked so there\'s documentation if anything comes up on your warranty.<br><br>'
    + '<strong style="color:#C8A45A">"My insurance won\'t cover it"</strong><br>'
    + 'Wind over 45 mph is generally covered under standard homeowners policies as an Act of God. The free inspection will show you if there\'s a claim worth filing \u2014 you don\'t commit to anything until you see what we find.';

  switchTabWind('wind-homeowner', document.querySelector('#panel-wind .ptab'));
  map.setView([ev.lat, ev.lng], 11);
}

function switchTab(tabId, btn) {
  const panel = document.getElementById('panel-hail');
  panel.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  panel.querySelectorAll('.ptab-content').forEach(c => c.classList.add('hidden'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('tab-' + tabId);
  if (el) el.classList.remove('hidden');
}

function switchTabWind(tabId, btn) {
  const panel = document.getElementById('panel-wind');
  panel.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  panel.querySelectorAll('.ptab-content').forEach(c => c.classList.add('hidden'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('tab-' + tabId);
  if (el) el.classList.remove('hidden');
}

function toRad(d) { return d * Math.PI / 180; }

function distMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function addressInWindEvent(addrLat, addrLng, ev) {
  return distMiles(addrLat, addrLng, ev.lat, ev.lng) <= (ev.radius_miles || 6);
}

async function searchAddress() {
  const raw = document.getElementById('address-input').value.trim();
  if (!raw) return;
  const btn = document.querySelector('.search-btn');
  btn.textContent = 'Searching\u2026';
  btn.disabled = true;
  try {
    const q = encodeURIComponent(raw + ', Georgia USA');
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + q + '&limit=1&countrycodes=us', { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.length) {
      alert('Address not found. Try including city and GA zip code.');
      btn.textContent = 'Check My Address'; btn.disabled = false;
      return;
    }
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (searchLayer) searchLayer.forEach(l => map.removeLayer(l));
    searchLayer = [];
    const pin = L.circleMarker([lat, lng], { radius: 10, color: '#C8A45A', fillColor: '#C8A45A', fillOpacity: 0.95, weight: 3 })
      .bindPopup('<strong style="color:#1A1410;font-family:Lato,sans-serif">Your address</strong>').openPopup();
    pin.addTo(map); searchLayer.push(pin);
    const ring = L.circle([lat, lng], { radius: 1609.34, color: 'rgba(200,164,90,0.45)', fillColor: 'rgba(200,164,90,0.04)', weight: 1.5, dashArray: '6,4' });
    ring.addTo(map); searchLayer.push(ring);
    map.setView([lat, lng], 13);
    const nearHail = HAIL.filter(e => distMiles(lat, lng, e.lat, e.lng) <= SEARCH_RADIUS_MILES).sort((a,b) => new Date(b.date) - new Date(a.date));
    const nearWind = WIND.filter(e => addressInWindEvent(lat, lng, e)).sort((a,b) => new Date(b.date) - new Date(a.date));
    showAddressPanel(raw, lat, lng, nearHail, nearWind);
  } catch(err) {
    alert('Search failed. Please check your connection and try again.');
    console.error(err);
  }
  btn.textContent = 'Check My Address'; btn.disabled = false;
}

function showAddressPanel(addr, lat, lng, nearHail, nearWind) {
  showPanel('panel-address');
  const hailInWindow = nearHail.filter(e => inWindow(e.date));
  const windInWindow = nearWind.filter(e => inWindow(e.date));
  const hailHistoric = nearHail.filter(e => !inWindow(e.date));
  const windHistoric = nearWind.filter(e => !inWindow(e.date));
  const total = hailInWindow.length + windInWindow.length;
  const largest = hailInWindow.length ? Math.max(...hailInWindow.map(e => e.size_in)) : null;
  const highestWind = windInWindow.length ? Math.max(...windInWindow.map(e => e.mph)) : null;
  const isSevere = (largest && largest >= 1.75) || (highestWind && highestWind >= 75);
  const qualifies = total > 0;

  const shortAddr = addr.length > 38 ? addr.substring(0, 36) + '\u2026' : addr;
  document.getElementById('addr-label').textContent = shortAddr;

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

  let html = '';
  if (isSevere) {
    html += '<div style="background:rgba(224,82,82,0.12);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:12px 14px;margin-bottom:14px;">'
      + '<div style="color:#E05252;font-weight:700;font-size:13px;margin-bottom:6px">\u26a0\ufe0f Severe Damage Detected Near Your Address</div>'
      + '<div style="color:rgba(247,242,234,0.8);font-size:12px;line-height:1.6">'
      + (largest >= 1.75 ? 'Golf ball+ hail (' + largest + '") hit within 1 mile. ' : '')
      + (highestWind >= 75 ? 'Wind speeds of ' + highestWind + ' mph were recorded in your area. ' : '')
      + 'This level of storm activity almost always causes insurance-claimable damage. <strong style="color:#E05252">Call Bailey Roofing today at (770) 381-8081</strong></div></div>';
  }

  if (hailInWindow.length) {
    html += '<div class="feed-section-label">Hail Events Within 1 Mile (2-yr window)</div>';
    hailInWindow.slice(0, 6).forEach(ev => {
      html += '<div class="feed-row"><span class="feed-date">' + fmtDate(ev.date) + '</span><span class="feed-detail">' + ev.city + '</span><span class="size-pill ' + hailSizeClass(ev.size_in) + '">' + ev.size_in + '"</span></div>';
    });
    if (hailInWindow.length > 6) html += '<div class="feed-row" style="justify-content:center"><span style="font-size:11px;color:var(--muted)">+ ' + (hailInWindow.length - 6) + ' more</span></div>';
  }

  if (windInWindow.length) {
    html += '<div class="feed-section-label" style="margin-top:10px">Wind Events in Your Area (2-yr window)</div>';
    windInWindow.slice(0, 4).forEach(ev => {
      html += '<div class="feed-row"><span class="feed-date">' + fmtDate(ev.date) + '</span><span class="feed-detail">' + ev.city + ' \u2022 ' + ev.mph + ' mph</span><span class="size-pill sp-wind">' + (ev.mph >= 75 ? 'Severe' : ev.mph >= 60 ? 'High' : 'Mod') + '</span></div>';
    });
  }

  if (!qualifies && (hailHistoric.length || windHistoric.length)) {
    html += '<div class="feed-section-label" style="margin-top:10px;color:rgba(247,242,234,0.35)">Prior History (outside claim window)</div>';
    [...hailHistoric.slice(0,3), ...windHistoric.slice(0,2)].forEach(ev => {
      const isHail = ev.size_in !== undefined;
      html += '<div class="feed-row" style="opacity:0.45"><span class="feed-date">' + fmtDate(ev.date) + '</span><span class="feed-detail">' + ev.city + (isHail ? '' : ' \u2022 ' + ev.mph + ' mph') + '</span><span class="size-pill ' + (isHail ? hailSizeClass(ev.size_in) : 'sp-wind') + '">' + (isHail ? ev.size_in + '"' : 'Wind') + '</span></div>';
    });
    html += '<div style="font-size:11px;color:rgba(247,242,234,0.35);padding:6px 0 2px">These events are outside the typical 2-year claim window.</div>';
  }

  if (!qualifies && !hailHistoric.length && !windHistoric.length) {
    html += '<div style="text-align:center;padding:20px 0;color:var(--muted);font-size:13px">No storm events found near this address in our database.<br><br>A preventive inspection is still recommended for any roof over 10 years old.</div>';
  }

  document.getElementById('addr-events-feed').innerHTML = html;

  const ctaBtn = document.getElementById('addr-cta-btn');
  if (isSevere) {
    ctaBtn.textContent = '\u26a0\ufe0f Call Us Today \u2014 Severe Damage Area';
    ctaBtn.style.background = '#E05252';
    ctaBtn.onclick = function() { window.location.href = 'tel:+17703818081'; };
  } else {
    ctaBtn.textContent = qualifies ? 'Book My Free Inspection \u2192' : 'Schedule a Preventive Inspection \u2192';
    ctaBtn.style.background = '#C8A45A';
    ctaBtn.onclick = openInspectionForm;
  }
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderMap();
  });
});

function buildQuickStats() {
  const hailInWindow = HAIL.filter(e => inWindow(e.date));
  const windInWindow = WIND.filter(e => inWindow(e.date));
  const golfBall = hailInWindow.filter(e => e.size_in >= 1.75).length;
  const counties = [...new Set([...hailInWindow.map(e => e.county), ...windInWindow.map(e => e.county)])].length;
  document.getElementById('quick-stats').innerHTML =
    '<div class="qs-row"><span class="qs-label">Hail events \u22650.75" (2yr window)</span><span class="qs-val">' + hailInWindow.length + '</span></div>'
    + '<div class="qs-row"><span class="qs-label">Wind events \u226545 mph</span><span class="qs-val">' + windInWindow.length + '</span></div>'
    + '<div class="qs-row"><span class="qs-label">Golf ball+ events</span><span class="qs-val">' + golfBall + '</span></div>'
    + '<div class="qs-row"><span class="qs-label">Counties with activity</span><span class="qs-val">' + counties + '</span></div>'
    + '<div class="qs-row"><span class="qs-label">Coverage window</span><span class="qs-val" style="font-size:10px">' + fmtWindowLabel() + '</span></div>';
}

function toggleFaq(btn) {
  const a = btn.nextElementSibling;
  const isOpen = a.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.faq-q').forEach(el => el.classList.remove('open'));
  if (!isOpen) { a.classList.add('open'); btn.classList.add('open'); }
}

function openInspectionForm(context) {
  if (window.self !== window.top) {
    try {
      if (window.parent.baileyPopup && window.parent.baileyPopup.open) {
        window.parent.baileyPopup.open(); return;
      }
    } catch(e) {}
  }
  const modal = document.getElementById('inspection-modal');
  if (modal) {
    modal.classList.add('open');
    if (context) { const ctx = document.getElementById('form-storm-context'); if (ctx) ctx.value = context; }
  }
}

function closeInspectionForm() { document.getElementById('inspection-modal').classList.remove('open'); }

function closeFormIfOutside(e) { if (e.target === document.getElementById('inspection-modal')) closeInspectionForm(); }

function openBaileyPopup() { openInspectionForm(); }

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('inspection-form');
  if (!form) return;
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = form.querySelector('.form-submit');
    btn.textContent = 'Sending\u2026'; btn.disabled = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        form.style.display = 'none';
        const s = document.getElementById('form-success');
        if (s) s.classList.remove('hidden');
      } else { btn.textContent = 'Try again'; btn.disabled = false; }
    } catch(err) { btn.textContent = 'Try again'; btn.disabled = false; }
  });
});

document.getElementById('address-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchAddress(); });

initMap();
