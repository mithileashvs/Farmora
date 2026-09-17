/* ================= ONBOARDING FLOW ================= */
// NOTE: This is a LOCAL-ONLY profile system, not real authentication. There is no backend
// server or database here — "Sign Up" / "Login" just save a name/phone to this device's
// browser storage (localStorage). It's built to look and feel like a real onboarding flow,
// but there is no password verification, account recovery, or cross-device sync.
// Be upfront about this if asked — a real system needs a backend auth service.

const onboardingOverlay = document.getElementById('onboardingOverlay');
const onboardStep1 = document.getElementById('onboardStep1');
const onboardStep2 = document.getElementById('onboardStep2');
const onboardStep3 = document.getElementById('onboardStep3');
let onboardSelectedLang = 'ta-IN';
let isLoginMode = false;

function showOnboardStep(n) {
  [onboardStep1, onboardStep2, onboardStep3].forEach(s => s.classList.remove('active'));
  document.getElementById('onboardStep' + n).classList.add('active');
}

// ---- Step 1: Sign up / Login tabs ----
const authTabSignup = document.getElementById('authTabSignup');
const authTabLogin = document.getElementById('authTabLogin');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authNote = document.getElementById('authNote');
const authName = document.getElementById('authName');
const authPhone = document.getElementById('authPhone');
const authPassword = document.getElementById('authPassword');

authTabSignup.addEventListener('click', () => {
  isLoginMode = false;
  authTabSignup.classList.add('active'); authTabLogin.classList.remove('active');
  authName.style.display = 'block';
  authSubmitBtn.textContent = 'Create Account';
  authNote.textContent = 'Creates a local profile on this device — no data leaves your phone.';
});
authTabLogin.addEventListener('click', () => {
  isLoginMode = true;
  authTabLogin.classList.add('active'); authTabSignup.classList.remove('active');
  authName.style.display = 'none';
  authSubmitBtn.textContent = 'Login';
  authNote.textContent = 'Log in with the phone number you signed up with on this device.';
});

authSubmitBtn.addEventListener('click', () => {
  const phone = authPhone.value.trim();
  const password = authPassword.value.trim();
  if (!phone || !password) { alert('Please fill in phone number and password.'); return; }

  if (isLoginMode) {
    try {
      const stored = JSON.parse(localStorage.getItem('farmora_account') || 'null');
      if (!stored || stored.phone !== phone || stored.password !== password) {
        alert('No matching local account found on this device. Try Sign Up instead.');
        return;
      }
      settingsName.value = stored.name || '';
    } catch (e) {}
  } else {
    const name = authName.value.trim();
    if (!name) { alert('Please enter your name.'); return; }
    try { localStorage.setItem('farmora_account', JSON.stringify({ name, phone, password })); } catch (e) {}
    settingsName.value = name;
  }
  saveProfile();
  showOnboardStep(2);
});

// ---- Step 2: Language ----
document.querySelectorAll('[data-onboard-lang]').forEach(btn => {
  btn.addEventListener('click', () => {
    onboardSelectedLang = btn.dataset.onboardLang;
    setVoiceLang(onboardSelectedLang, onboardSelectedLang === 'ta-IN' ? 'lang-ta' : 'lang-en');
    syncSettingsLangBtn(onboardSelectedLang);
    showOnboardStep(3);
  });
});

// ---- Step 3: Location ----
document.getElementById('onboardGeoBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { alert('Geolocation not supported on this device.'); return; }
  const btn = document.getElementById('onboardGeoBtn');
  btn.textContent = '📍 Locating...';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const place = await reverseGeocode(latitude, longitude);
      document.getElementById('onboardLocationInput').value = place || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
    } catch (e) { console.error(e); alert('Could not determine location name, but your coordinates were captured. You can also type your location manually.'); }
    finally { btn.textContent = '📍 Use my current location'; }
  }, () => { alert('Location access denied.'); btn.textContent = '📍 Use my current location'; });
});

function completeOnboarding() {
  const loc = document.getElementById('onboardLocationInput').value.trim();
  const crop = document.getElementById('onboardCropInput').value.trim();
  if (loc) settingsLocation.value = loc;
  if (crop) settingsCrop.value = crop;
  saveProfile();
  try { localStorage.setItem('farmora_onboarded', 'true'); } catch (e) {}
  onboardingOverlay.style.display = 'none';
  if (settingsLocation.value) loadWeather(settingsLocation.value);
}
document.getElementById('locContinueBtn').addEventListener('click', completeOnboarding);
document.getElementById('locSkipBtn').addEventListener('click', completeOnboarding);

// ---- On page load: skip onboarding entirely for returning users ----
(function checkOnboardingStatus() {
  try {
    if (localStorage.getItem('farmora_onboarded') === 'true') {
      onboardingOverlay.style.display = 'none';
    }
  } catch (e) { onboardingOverlay.style.display = 'none'; } // if storage blocked, don't trap the user
})();

/* ================= PWA SETUP ================= */
const manifest = {
  name: "Farmora - AI Farming Assistant", short_name: "Farmora",
  start_url: ".", display: "standalone", background_color: "#F4F8F4", theme_color: "#234D2C",
  icons: [{ src: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23234D2C"/><text x="50" y="65" font-size="55" text-anchor="middle">🌾</text></svg>'), sizes: "192x192", type: "image/svg+xml" }]
};
const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
document.getElementById('manifestLink').href = URL.createObjectURL(manifestBlob);

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBtn').classList.add('show');
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installBtn').classList.remove('show');
});
// Note: full offline support needs a service worker registered from a separate .js file
// (browsers restrict inline/blob service workers for security). For the hackathon demo,
// this provides installability; offline caching is a natural next step post-event.

/* ================= NAVIGATION ================= */
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const hamburgerBtn = document.getElementById('hamburgerBtn');
const topbarTitle = document.getElementById('topbarTitle');
const rightCol = document.getElementById('rightCol');
const screenTitles = { chat: 'Farmora', dashboard: 'Dashboard', farms: 'My Farms', cropguide: 'Crop Guide', weather: 'Weather', market: 'Market Prices', schemes: 'Govt Schemes', knowledge: 'Knowledge Base', alerts: 'Alerts', settings: 'Settings' };
hamburgerBtn.addEventListener('click', () => { sidebar.classList.add('open'); sidebarOverlay.classList.add('show'); });
sidebarOverlay.addEventListener('click', () => { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); });
function goToScreen(name) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
  const target = document.getElementById('screen-' + name);
  target.classList.add('active');
  if (name === 'chat') { target.style.display = 'flex'; rightCol.style.display = window.innerWidth >= 1000 ? 'block' : 'none'; }
  else rightCol.style.display = 'none';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-screen="${name}"]`).classList.add('active');
  topbarTitle.textContent = screenTitles[name];
  sidebar.classList.remove('open'); sidebarOverlay.classList.remove('show');
  if (name === 'weather') initWeatherIfNeeded();
  if (name === 'dashboard') initDashboard();
  if (name === 'alerts') initAlerts();
  if (name === 'farms') initFarmsScreen();
}
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => goToScreen(item.dataset.screen)));
document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => { goToScreen('chat'); const c = document.getElementById('chip-' + btn.dataset.jump); if (c) c.click(); }));
document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => goToScreen(el.dataset.nav)));
if (window.innerWidth >= 1000) rightCol.style.display = 'block';

/* ================= SETTINGS / PROFILE ================= */
const settingsName = document.getElementById('settingsName');
const settingsCrop = document.getElementById('settingsCrop');
const settingsLocation = document.getElementById('settingsLocation');
const sidebarName = document.getElementById('sidebarName');
const sidebarLoc = document.getElementById('sidebarLoc');
const avatarInitial = document.getElementById('avatarInitial');
const heroGreeting = document.getElementById('heroGreeting');
function loadProfile() {
  try {
    settingsName.value = localStorage.getItem('farmora_name') || '';
    settingsCrop.value = localStorage.getItem('farmora_crop') || '';
    settingsLocation.value = localStorage.getItem('farmora_location') || '';
  } catch (e) {}
  refreshProfileDisplay(settingsName.value, settingsLocation.value);
}
function refreshProfileDisplay(name, loc) {
  sidebarName.textContent = name || 'Farmer';
  sidebarLoc.textContent = loc || 'Set your location in Settings';
  avatarInitial.textContent = (name || 'F').trim().charAt(0).toUpperCase();
  heroGreeting.textContent = name ? `Hello, ${name}! 👋` : 'Hello! 👋';
}
function saveProfile() {
  try {
    localStorage.setItem('farmora_name', settingsName.value);
    localStorage.setItem('farmora_crop', settingsCrop.value);
    localStorage.setItem('farmora_location', settingsLocation.value);
  } catch (e) {}
  refreshProfileDisplay(settingsName.value, settingsLocation.value);
  if (typeof syncUserProfile === 'function') syncUserProfile();
}
[settingsName, settingsCrop, settingsLocation].forEach(el => el.addEventListener('change', saveProfile));
loadProfile();
document.getElementById('settingsLangTa').addEventListener('click', () => { setVoiceLang('ta-IN','lang-ta'); syncSettingsLangBtn('ta-IN'); saveProfile(); });
document.getElementById('settingsLangEn').addEventListener('click', () => { setVoiceLang('en-IN','lang-en'); syncSettingsLangBtn('en-IN'); saveProfile(); });
function syncSettingsLangBtn(lang) {
  document.getElementById('settingsLangTa').classList.toggle('active', lang === 'ta-IN');
  document.getElementById('settingsLangEn').classList.toggle('active', lang === 'en-IN');
}
document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  if (confirm('Clear all chat history?')) {
    document.querySelectorAll('#chatArea .msg-row').forEach((m,i) => { if (i>0) m.remove(); });
    alert('Chat history cleared.');
  }
});

/* ================= GEOLOCATION ================= */
document.getElementById('geoBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { alert('Geolocation not supported on this device.'); return; }
  const label = document.getElementById('geoBtnLabel');
  label.textContent = 'Locating...';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const place = await reverseGeocode(latitude, longitude);
      const finalPlace = place || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      settingsLocation.value = finalPlace;
      saveProfile();
      loadWeather(finalPlace);
      label.textContent = finalPlace;
    } catch (e) { console.error(e); alert('Could not determine your location name, but coordinates were captured. Try typing your location manually in Settings.'); label.textContent = 'Set location'; }
  }, () => { alert('Location access denied or unavailable.'); label.textContent = 'Set location'; });
});
// Reflect any already-saved location (e.g. from onboarding) in the pill on load
if (settingsLocation.value) { document.getElementById('geoBtnLabel').textContent = settingsLocation.value; }

/* ================= DASHBOARD ================= */
let dashboardInited = false;
const dashTips = { 'ta-IN': ["மண் ஈரப்பதத்தை தினமும் சரிபார்க்கவும்.", "பயிர் சுழற்சி மண் வளத்தை மேம்படுத்தும்.", "காலை நேரத்தில் நீர்ப்பாசனம் சிறந்தது."], 'en-IN': ["Check soil moisture daily before irrigating.", "Crop rotation improves long-term soil health.", "Morning irrigation reduces water loss to evaporation."] };
async function initDashboard() {
  document.getElementById('dashName').textContent = settingsName.value ? `, ${settingsName.value}` : '';
  const tips = dashTips[voiceLang] || dashTips['ta-IN'];
  document.getElementById('dashTip').textContent = tips[Math.floor(Math.random() * tips.length)];
  if (!dashboardInited && settingsLocation.value) { fetchWeatherForDashboard(settingsLocation.value); dashboardInited = true; }
  renderDashFarmSummary();
  renderDashDiagnoses();
}
async function renderDashFarmSummary() {
  const el = document.getElementById('dashFarmSummary');
  await fetchFarms();
  if (!farmsCache.length) {
    el.innerHTML = `<div class="card"><h3>🚜 No farms yet</h3><p>Add your first farm to see it here, and get more tailored advice in Chat.</p>
      <div class="quick-actions"><button class="quick-btn" data-nav="farms">Add your first farm</button></div></div>`;
    el.querySelector('[data-nav]').addEventListener('click', () => goToScreen('farms'));
    return;
  }
  const active = farmsCache.find(f => f._id === activeFarmId) || farmsCache[0];
  if (!activeFarmId) setActiveFarmId(active._id);
  const activeCrop = (active.crops || []).find(c => c.status === 'growing' || c.status === 'sown');
  el.innerHTML = `<div class="card"><h3>🚜 ${escapeHtml(active.name)}</h3>
    <p>${active.location && active.location.name ? '📍 ' + escapeHtml(active.location.name) + ' · ' : ''}${active.areaAcres ? active.areaAcres + ' acres' : 'Area not set'}</p>
    <p style="margin-top:4px;">${activeCrop ? '🌱 Current crop: ' + escapeHtml(activeCrop.name) + (activeCrop.variety ? ' (' + escapeHtml(activeCrop.variety) + ')' : '') : 'No active crop set yet.'}</p>
    <div class="quick-actions"><button class="quick-btn" data-nav="farms">Manage farms</button></div></div>`;
  el.querySelector('[data-nav]').addEventListener('click', () => goToScreen('farms'));
}
function confidenceLabel(c) { return c === 'high' ? 'High confidence' : c === 'medium' ? 'Medium confidence' : c === 'low' ? 'Low confidence' : ''; }
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? 'Just now' : mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}
async function renderDashDiagnoses() {
  const el = document.getElementById('dashDiagnoses');
  try {
    const res = await fetch(apiUrl('/api/diagnoses/' + FARMORA_USER_ID + '?limit=5'));
    if (!res.ok) { el.innerHTML = ''; return; }
    const data = await res.json();
    const diagnoses = (data.success && data.diagnoses) || [];
    if (!diagnoses.length) { el.innerHTML = '<div class="card"><p style="color:var(--soil-light);">No checks yet — use Chat to analyze a soil or leaf photo.</p></div>'; return; }
    el.innerHTML = '';
    diagnoses.forEach(d => {
      const icon = d.mode === 'soil' ? '🟤' : d.mode === 'leaf' ? '🍃' : '💬';
      const card = document.createElement('div'); card.className = 'card'; card.style.cursor = 'pointer';
      card.innerHTML = `<h3>${icon} ${escapeHtml(d.crop || (d.mode === 'soil' ? 'Soil analysis' : d.mode === 'leaf' ? 'Leaf / pest check' : 'General check'))}</h3>
        <p>${escapeHtml((d.diagnosis || '').slice(0, 140))}${(d.diagnosis || '').length > 140 ? '…' : ''}</p>
        ${d.confidence ? `<span class="tag">${confidenceLabel(d.confidence)}</span>` : ''}
        <div style="font-size:11px;color:#9AAE9D;margin-top:6px;">${timeAgo(d.createdAt)}</div>`;
      card.addEventListener('click', () => alert(d.diagnosis));
      el.appendChild(card);
    });
  } catch (e) { el.innerHTML = ''; }
}
async function fetchWeatherForDashboard(loc) {
  try { const geo = await geocodeLocation(loc); if (!geo) return; const w = await fetchWeather(geo.latitude, geo.longitude); document.getElementById('dashTemp').textContent = Math.round(w.current.temperature_2m) + '°C'; } catch (e) {}
}

/* ================= WEATHER ================= */
const weatherContent = document.getElementById('weatherContent');
const weatherLocationInput = document.getElementById('weatherLocationInput');
let weatherInited = false;
const weatherCodeMap = { 0:['☀️','Clear sky'],1:['🌤️','Mainly clear'],2:['⛅','Partly cloudy'],3:['☁️','Overcast'],45:['🌫️','Fog'],48:['🌫️','Fog'],51:['🌦️','Light drizzle'],53:['🌦️','Drizzle'],55:['🌧️','Dense drizzle'],61:['🌧️','Light rain'],63:['🌧️','Rain'],65:['🌧️','Heavy rain'],80:['🌦️','Rain showers'],81:['🌧️','Rain showers'],82:['⛈️','Violent showers'],95:['⛈️','Thunderstorm'],96:['⛈️','Thunderstorm with hail'] };
function weatherIcon(c) { return (weatherCodeMap[c] || ['❓','Unknown'])[0]; }
function weatherDesc(c) { return (weatherCodeMap[c] || ['❓','Unknown'])[1]; }
async function geocodeLocation(name) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
  const data = await res.json();
  if (!data.results || !data.results.length) return null;
  return { latitude: data.results[0].latitude, longitude: data.results[0].longitude, label: data.results[0].name + (data.results[0].admin1 ? ', ' + data.results[0].admin1 : '') };
}
// Reverse geocoding (coordinates -> place name) via Nominatim (OpenStreetMap), free and no API key.
// Open-Meteo does NOT offer a reverse geocoding endpoint (confirmed via their own GitHub discussion
// tracking it as an unbuilt future feature) — using it here previously caused every geolocation
// lookup to silently fail with "could not determine location name."
async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=en`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Reverse geocode request failed: ' + res.status);
  const data = await res.json();
  const addr = data.address || {};
  const place = addr.village || addr.town || addr.city || addr.county || addr.suburb || addr.state_district;
  const state = addr.state;
  if (place && state) return `${place}, ${state}`;
  if (place) return place;
  if (data.display_name) return data.display_name.split(',').slice(0, 2).join(',').trim();
  return null;
}
async function fetchWeather(lat, lon) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max&timezone=auto`);
  return res.json();
}
async function loadWeather(locationName) {
  weatherContent.innerHTML = '<div class="weather-loading">Fetching forecast...</div>';
  try {
    const geo = await geocodeLocation(locationName);
    if (!geo) { weatherContent.innerHTML = '<div class="weather-loading">Location not found.</div>'; return; }
    const w = await fetchWeather(geo.latitude, geo.longitude);
    renderWeather(w, geo.label); renderWeatherWidget(w); generateAlertsFromWeather(w);
    weatherInited = true;
  } catch (e) { weatherContent.innerHTML = '<div class="weather-loading">Could not load weather.</div>'; }
}
function renderWeather(w, label) {
  const cur = w.current, daily = w.daily;
  let html = `<div class="weather-hero-full"><div class="temp">${Math.round(cur.temperature_2m)}°C</div><div>${weatherIcon(cur.weather_code)} ${weatherDesc(cur.weather_code)} · Humidity ${cur.relative_humidity_2m}%</div><div style="font-size:12px;opacity:0.8;margin-top:6px;">📍 ${label}</div></div><div class="forecast-row">`;
  for (let i = 0; i < Math.min(5, daily.time.length); i++) {
    const d = new Date(daily.time[i]); const dayLabel = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
    html += `<div class="forecast-day"><div style="font-size:11px;color:var(--soil-light);font-weight:600;">${dayLabel}</div><div style="font-size:20px;margin:4px 0;">${weatherIcon(daily.weather_code[i])}</div><div style="font-size:12.5px;font-weight:600;">${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°</div></div>`;
  }
  weatherContent.innerHTML = html + '</div>';
}
function renderWeatherWidget(w) {
  const cur = w.current;
  document.getElementById('weatherWidget').innerHTML = `<div class="weather-mini-temp">${Math.round(cur.temperature_2m)}°C</div><div class="weather-mini-desc">${weatherIcon(cur.weather_code)} ${weatherDesc(cur.weather_code)}</div><div class="widget-link" data-nav="weather">View full forecast →</div>`;
  document.querySelector('#weatherWidget .widget-link').addEventListener('click', () => goToScreen('weather'));
}
function initWeatherIfNeeded() { if (!weatherInited && settingsLocation.value) { weatherLocationInput.value = settingsLocation.value; loadWeather(settingsLocation.value); } }
document.getElementById('weatherSearchBtn').addEventListener('click', () => { if (weatherLocationInput.value.trim()) loadWeather(weatherLocationInput.value.trim()); });
weatherLocationInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && weatherLocationInput.value.trim()) loadWeather(weatherLocationInput.value.trim()); });
if (settingsLocation.value) loadWeather(settingsLocation.value);

/* ================= ALERTS ================= */
function initAlerts() { if (settingsLocation.value && !weatherInited) loadWeather(settingsLocation.value); }
function generateAlertsFromWeather(w) {
  const alertsEl = document.getElementById('alertsContent');
  const alerts = [];
  if (w.daily.precipitation_sum[1] > 5) alerts.push({ type: 'warn', icon: '🌧️', title: 'Rain expected tomorrow', text: 'Delay pesticide or fertilizer spraying.' });
  else alerts.push({ type: 'good', icon: '☀️', title: 'Clear conditions tomorrow', text: 'Good window for spraying or field work.' });
  if (w.daily.temperature_2m_max[0] > 38) alerts.push({ type: 'warn', icon: '🌡️', title: 'High temperature today', text: 'Irrigate during early morning or evening.' });
  alerts.push({ type: 'info', icon: '🌱', title: 'Reminder', text: 'Check your crop weekly using the Leaf/Pest photo feature.' });
  alertsEl.innerHTML = alerts.map(a => `<div class="alert-item ${a.type}"><div>${a.icon}</div><div class="alert-text"><div class="t">${a.title}</div>${a.text}</div></div>`).join('');
}

/* ================= GOVERNMENT SCHEME MATCHER ================= */
const schemeRules = [
  { name: "PM-KISAN", check: (c,l,cat) => cat === 'small', desc: "₹6,000/year direct income support for small and marginal landholding farmer families, paid in 3 installments." },
  { name: "PMFBY (Crop Insurance)", check: (c,l,cat) => true, desc: "Subsidized crop insurance covering losses from natural calamities, pests, and diseases — premium as low as 2% of sum insured for Kharif crops." },
  { name: "Soil Health Card Scheme", check: (c,l,cat) => true, desc: "Free soil testing every 2 years with crop-wise fertilizer recommendations from your local agriculture department." },
  { name: "PM Krishi Sinchayee Yojana", check: (c,l,cat) => l && parseFloat(l) <= 5, desc: "Subsidy on drip/sprinkler irrigation equipment for small landholdings, improving water use efficiency." },
  { name: "Sub-Mission on Agricultural Mechanization", check: (c,l,cat) => cat === 'small', desc: "Subsidy (up to 50%) on purchase of farm machinery and equipment for small and marginal farmers." }
];
document.getElementById('matchSchemesBtn').addEventListener('click', () => {
  const crop = document.getElementById('schemeCrop').value.trim();
  const land = document.getElementById('schemeLand').value;
  const cat = document.getElementById('schemeCategory').value;
  const matched = schemeRules.filter(s => s.check(crop, land, cat));
  const resultsEl = document.getElementById('schemeResults');
  if (!matched.length) { resultsEl.innerHTML = '<p style="font-size:13px;color:var(--soil-light);">No matches found — try adjusting your details.</p>'; return; }
  resultsEl.innerHTML = `<div style="font-size:12px;color:var(--soil-light);margin-bottom:8px;">Based on the details provided, you may be eligible for:</div>` +
    matched.map(s => `<div class="scheme-result"><h4>✅ ${s.name}</h4><p>${s.desc}</p></div>`).join('') +
    `<div style="font-size:11px;color:#9AAE9D;margin-top:6px;">This is a simplified eligibility check for guidance only. Confirm details at your nearest agriculture office or pmkisan.gov.in.</div>`;
});

/* ================= FAQ ================= */
document.querySelectorAll('.faq-item').forEach(item => item.querySelector('.faq-q').addEventListener('click', () => item.classList.toggle('open')));

/* ================= CHAT CORE ================= */
const chatArea = document.getElementById('chatArea');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const cameraBtn = document.getElementById('cameraBtn');
const fileInput = document.getElementById('fileInput');
const previewBar = document.getElementById('previewBar');
const suggestionsBar = document.getElementById('suggestions');

let currentMode = 'general';
let pendingImages = []; // array of { displayUrl, base64 }
let voiceLang = 'ta-IN';

document.getElementById('welcomeTime').textContent = formatTime(new Date());
function formatTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

document.getElementById('lang-ta').addEventListener('click', () => { setVoiceLang('ta-IN', 'lang-ta'); syncSettingsLangBtn('ta-IN'); });
document.getElementById('lang-en').addEventListener('click', () => { setVoiceLang('en-IN', 'lang-en'); syncSettingsLangBtn('en-IN'); });
function setVoiceLang(lang, activeId) {
  voiceLang = lang;
  document.querySelectorAll('.lang-chip').forEach(c => c.classList.remove('active'));
  document.getElementById(activeId).classList.add('active');
  if (recognition) recognition.lang = lang;
  renderSuggestions();
}
function detectLanguage(text) { if (!text) return voiceLang; return /[\u0B80-\u0BFF]/.test(text) ? 'ta-IN' : 'en-IN'; }

const modeConfig = {
  general: { label: '', suggestions: { 'ta-IN': ['நெல் பயிரிடும் காலம்?', 'இயற்கை உரம் பரிந்துரை', 'மழை இல்லாத போது என்ன செய்யலாம்?'], 'en-IN': ['Weather today', 'Best fertilizer for paddy', 'What schemes am I eligible for?'] } },
  soil: { label: '🟤 Soil analysis mode', suggestions: null },
  leaf: { label: '🍃 Leaf / pest check mode (up to 3 photos)', suggestions: null }
};

// ---- Attachment menu (replaces old always-visible mode chips) ----
const attachMenu = document.getElementById('attachMenu');
const activeModeBar = document.getElementById('activeModeBar');
const activeModeLabel = document.getElementById('activeModeLabel');

cameraBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  attachMenu.classList.toggle('show');
});
document.addEventListener('click', (e) => {
  if (!attachMenu.contains(e.target) && e.target !== cameraBtn) attachMenu.classList.remove('show');
});
document.querySelectorAll('.attach-option').forEach(opt => {
  opt.addEventListener('click', () => {
    currentMode = opt.dataset.attachMode;
    attachMenu.classList.remove('show');
    updateActiveModeIndicator();
    renderSuggestions();
    fileInput.click();
  });
});
document.getElementById('clearModeBtn').addEventListener('click', () => {
  currentMode = 'general';
  updateActiveModeIndicator();
  renderSuggestions();
});
function updateActiveModeIndicator() {
  const cfg = modeConfig[currentMode];
  if (currentMode === 'general' || !cfg.label) { activeModeBar.style.display = 'none'; }
  else { activeModeBar.style.display = 'flex'; activeModeLabel.textContent = cfg.label; }
}

function renderSuggestions() {
  suggestionsBar.innerHTML = '';
  const cfg = modeConfig[currentMode].suggestions; if (!cfg) return;
  (cfg[voiceLang] || cfg['ta-IN']).forEach(text => {
    const btn = document.createElement('button'); btn.className = 'suggestion-chip'; btn.textContent = text; btn.onclick = () => sendMessage(text);
    suggestionsBar.appendChild(btn);
  });
}
renderSuggestions();

function formatMessageContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const bulletLines = lines.filter(l => l.startsWith('- '));
  const normalLines = lines.filter(l => !l.startsWith('- '));
  let html = '';
  normalLines.forEach(l => { html += `<div>${escapeHtml(l)}</div>`; });
  if (bulletLines.length) html += '<ul class="msg-checklist">' + bulletLines.map(l => `<li>${escapeHtml(l.slice(2))}</li>`).join('') + '</ul>';
  return html || escapeHtml(text);
}
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function confidenceBadge(level) {
  if (!level) return '';
  const cls = level === 'high' ? 'confidence-high' : level === 'medium' ? 'confidence-medium' : 'confidence-low';
  const label = level === 'high' ? '● High confidence' : level === 'medium' ? '● Medium confidence — verify if possible' : '● Low confidence — please consult an expert';
  return `<div class="confidence-badge ${cls}">${label}</div>`;
}

function sourcesBlock(sources) {
  if (!sources || !sources.length) return null;
  const wrap = document.createElement('div'); wrap.className = 'sources-block';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'sources-toggle';
  toggle.textContent = `📚 Based on ${sources.length} agricultural source${sources.length > 1 ? 's' : ''} ▾`;
  const list = document.createElement('div'); list.className = 'sources-list'; list.style.display = 'none';
  sources.forEach(s => {
    const item = document.createElement('div'); item.className = 'source-item';
    const titleEl = document.createElement('div'); titleEl.className = 'source-title';
    if (s.url) {
      const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = s.title;
      titleEl.appendChild(a);
    } else {
      titleEl.textContent = s.title;
    }
    item.appendChild(titleEl);
    if (s.organization) { const org = document.createElement('div'); org.className = 'source-org'; org.textContent = s.organization; item.appendChild(org); }
    list.appendChild(item);
  });
  toggle.addEventListener('click', () => {
    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : 'block';
    toggle.textContent = `📚 Based on ${sources.length} agricultural source${sources.length > 1 ? 's' : ''} ${open ? '▾' : '▴'}`;
  });
  wrap.appendChild(toggle); wrap.appendChild(list);
  return wrap;
}

function addMessage(text, sender, imageUrls, lang, confidence, sources) {
  const row = document.createElement('div');
  row.className = 'msg-row' + (sender === 'user' ? ' user' : '');
  const avatar = document.createElement('div'); avatar.className = 'msg-avatar ' + sender; avatar.textContent = sender === 'bot' ? '🌾' : '🧑‍🌾';
  const col = document.createElement('div'); col.className = 'msg-bubble-col';
  const bubble = document.createElement('div'); bubble.className = 'msg ' + sender;
  if (imageUrls && imageUrls.length) {
    const photosDiv = document.createElement('div'); photosDiv.className = 'msg-photos';
    imageUrls.forEach(url => { const img = document.createElement('img'); img.src = url; photosDiv.appendChild(img); });
    bubble.appendChild(photosDiv);
  }
  if (sender === 'bot' && confidence) bubble.insertAdjacentHTML('beforeend', confidenceBadge(confidence));
  const textDiv = document.createElement('div'); textDiv.innerHTML = formatMessageContent(text); bubble.appendChild(textDiv);
  if (sender === 'bot' && text) {
    const src = sourcesBlock(sources);
    if (src) bubble.appendChild(src);
    const actions = document.createElement('div'); actions.className = 'msg-actions';
    const replay = document.createElement('span'); replay.className = 'replay'; replay.textContent = '🔊 Play voice'; replay.onclick = () => speak(text, lang);
    actions.appendChild(replay);
    const fbWrap = document.createElement('div'); fbWrap.className = 'feedback-btns';
    const up = document.createElement('button'); up.className = 'fb-btn'; up.textContent = '👍';
    const down = document.createElement('button'); down.className = 'fb-btn'; down.textContent = '👎';
    up.onclick = () => { up.classList.add('selected'); down.classList.remove('selected'); saveFeedback(text, 'up'); };
    down.onclick = () => { down.classList.add('selected'); up.classList.remove('selected'); saveFeedback(text, 'down'); };
    fbWrap.appendChild(up); fbWrap.appendChild(down);
    actions.appendChild(fbWrap);
    bubble.appendChild(actions);
  }
  col.appendChild(bubble);
  const time = document.createElement('div'); time.className = 'msg-time'; time.textContent = formatTime(new Date()); col.appendChild(time);
  row.appendChild(avatar); row.appendChild(col);
  chatArea.appendChild(row); chatArea.scrollTop = chatArea.scrollHeight;
}
function saveFeedback(text, rating) {
  try {
    const key = 'farmora_feedback';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ text: text.slice(0, 80), rating, time: Date.now() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {}
}
function showTyping() {
  const div = document.createElement('div'); div.className = 'typing-indicator'; div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>'; chatArea.appendChild(div); chatArea.scrollTop = chatArea.scrollHeight;
}
function hideTyping() { const el = document.getElementById('typingIndicator'); if (el) el.remove(); }

/* ---- Multi-photo upload (up to 3) ---- */
function compressImage(file, maxDimension) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; }; reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDimension) { height = Math.round(height * (maxDimension / width)); width = maxDimension; }
      else if (height > maxDimension) { width = Math.round(width * (maxDimension / height)); height = maxDimension; }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject; reader.readAsDataURL(file);
  });
}
function renderPreviewBar() {
  if (!pendingImages.length) { previewBar.classList.remove('show'); previewBar.innerHTML = ''; return; }
  previewBar.classList.add('show');
  previewBar.innerHTML = '';
  pendingImages.forEach((img, i) => {
    const thumb = document.createElement('div'); thumb.className = 'preview-thumb';
    thumb.innerHTML = `<img src="${img.displayUrl}"><button class="rm" data-i="${i}">✕</button>`;
    previewBar.appendChild(thumb);
  });
  const label = document.createElement('span'); label.className = 'preview-label';
  label.textContent = pendingImages.length + (pendingImages.length === 1 ? ' photo ready' : ' photos ready') + ' — more angles improve accuracy';
  previewBar.appendChild(label);
  if (pendingImages.length < 3) {
    const addBtn = document.createElement('button'); addBtn.className = 'add-more-btn'; addBtn.textContent = '+';
    addBtn.onclick = () => fileInput.click();
    previewBar.appendChild(addBtn);
  }
  previewBar.querySelectorAll('.rm').forEach(btn => btn.addEventListener('click', (e) => { pendingImages.splice(parseInt(e.target.dataset.i), 1); renderPreviewBar(); }));
}
fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files).slice(0, 3 - pendingImages.length);
  for (const file of files) {
    try {
      const dataUrl = await compressImage(file, 800);
      pendingImages.push({ displayUrl: dataUrl, base64: dataUrl.split(',')[1] });
    } catch (err) { console.error(err); }
  }
  fileInput.value = '';
  renderPreviewBar();
});

function sendMessage(text) {
  const hasImages = pendingImages.length > 0;
  if (!text.trim() && !hasImages) return;
  const displayText = text.trim() || (currentMode === 'soil' ? '[Soil photo sent]' : currentMode === 'leaf' ? `[${pendingImages.length} leaf photo${pendingImages.length>1?'s':''} sent]` : '[Photo sent]');
  const imageDisplayUrls = pendingImages.map(i => i.displayUrl);
  addMessage(displayText, 'user', imageDisplayUrls);
  const imagesForRequest = pendingImages.map(i => i.displayUrl);
  const modeForRequest = currentMode;
  textInput.value = ''; pendingImages = []; renderPreviewBar();
  showTyping();
  getAIResponse(text.trim(), modeForRequest, imagesForRequest);
}
sendBtn.addEventListener('click', () => sendMessage(textInput.value));
textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(textInput.value); });

/* ---- Speech ---- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition, listening = false;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = voiceLang; recognition.interimResults = false; recognition.maxAlternatives = 1;
  recognition.onstart = () => { listening = true; micBtn.classList.add('listening'); };
  recognition.onend = () => { listening = false; micBtn.classList.remove('listening'); };
  recognition.onerror = (e) => { listening = false; micBtn.classList.remove('listening'); };
  recognition.onresult = (event) => sendMessage(event.results[0][0].transcript);
} else { micBtn.style.display = 'none'; }
micBtn.addEventListener('click', () => { if (recognition) listening ? recognition.stop() : recognition.start(); });

let cachedVoices = [];
function loadVoices() { cachedVoices = speechSynthesis.getVoices(); }
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
function speak(text, lang) {
  lang = lang || detectLanguage(text);
  if (!cachedVoices.length) cachedVoices = speechSynthesis.getVoices();
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang; utterance.rate = 0.9;
  const matchedVoice = cachedVoices.find(v => v.lang === lang) || cachedVoices.find(v => v.lang && v.lang.startsWith(lang.split('-')[0]));
  if (matchedVoice) utterance.voice = matchedVoice;
  else if (lang === 'ta-IN') { alert('இந்த சாதனத்தில் தமிழ் குரல் நிறுவப்படவில்லை.'); return; }
  speechSynthesis.speak(utterance);
}

/* ---- Backend API calls ----
   All Groq calls now go through the Farmora backend (see /backend) instead of
   the browser calling Groq directly, so the API key is never exposed here. */
function apiUrl(path) {
  const base = (window.FARMORA_CONFIG && window.FARMORA_CONFIG.API_BASE_URL) || "";
  return base.replace(/\/$/, "") + path;
}
// Converts a data: URL (e.g. from canvas.toDataURL(), used by
// compressImage() above) into a Blob for upload, WITHOUT using fetch().
// fetch() on a data: URL is subject to CSP's connect-src, which — correctly
// — only allows this backend's own origin plus the specific external APIs
// the frontend calls directly (Open-Meteo/Nominatim); it does not, and
// should not, need to allow "data:". Decoding manually avoids needing any
// CSP change at all for this purely-local, no-network conversion.
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = /data:(.*?);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
async function readErrorMessage(response) {
  try { const data = await response.json(); if (data && data.error) return data.error; } catch (e) {}
  return "Farmora could not process the request.";
}
async function getAIResponse(question, mode, imageDataUrls) {
  try {
    const crop = settingsCrop.value.trim();
    const location = settingsLocation.value.trim();
    let response;
    if (imageDataUrls && imageDataUrls.length) {
      const formData = new FormData();
      formData.append('message', question || '');
      formData.append('mode', mode);
      formData.append('language', voiceLang);
      if (crop) formData.append('crop', crop);
      if (location) formData.append('location', location);
      formData.append('userId', FARMORA_USER_ID);
      if (activeFarmId) formData.append('farmId', activeFarmId);
      for (const dataUrl of imageDataUrls) {
        const blob = dataUrlToBlob(dataUrl);
        formData.append('images', blob, 'photo.jpg');
      }
      response = await fetch(apiUrl('/api/analyze'), { method: 'POST', body: formData });
    } else {
      response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, mode, language: voiceLang, crop, location, userId: FARMORA_USER_ID, farmId: activeFarmId || undefined })
      });
    }
    if (!response.ok) throw new Error(await readErrorMessage(response));
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "Farmora could not process the request.");
    hideTyping();
    addMessage(data.response, 'bot', null, data.language, data.confidence, data.sources);
    if (imageDataUrls && imageDataUrls.length && document.getElementById('dashDiagnoses')) renderDashDiagnoses();
  } catch (err) { hideTyping(); addMessage("⚠️ Error: " + err.message, 'bot'); }
}

/* ================= PHASE 2: ANONYMOUS IDENTITY, PROFILE SYNC, FARMS, HISTORY =================
   farmora_user_id is a random UUID generated once per browser/device and stored in
   localStorage. It is NOT authentication — there is no password or verified identity
   behind it. Anyone with access to this browser (or who learns the ID) can read/write
   data tied to it. It exists only so the backend can persist and recall this device's
   profile, farms, and history across sessions until real authentication is added. */
function getAnonUserId() {
  try {
    let id = localStorage.getItem('farmora_user_id');
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('anon-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem('farmora_user_id', id);
    }
    return id;
  } catch (e) { return 'anon-' + Date.now(); }
}
const FARMORA_USER_ID = getAnonUserId();

let activeFarmId = null;
try { activeFarmId = localStorage.getItem('farmora_active_farm_id') || null; } catch (e) {}
function setActiveFarmId(id) {
  activeFarmId = id;
  try { if (id) localStorage.setItem('farmora_active_farm_id', id); else localStorage.removeItem('farmora_active_farm_id'); } catch (e) {}
}

async function syncUserProfile() {
  try {
    await fetch(apiUrl('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: FARMORA_USER_ID,
        name: settingsName.value.trim(),
        language: voiceLang,
        location: { name: settingsLocation.value.trim() },
        primaryCrop: settingsCrop.value.trim(),
      }),
    });
  } catch (e) { console.error('Farmora: profile sync failed (server may be offline)', e); }
}

// The backend is the source of truth once reachable; local profile (already
// loaded by loadProfile()) is the fallback when it isn't.
async function hydrateProfileFromBackend() {
  try {
    const res = await fetch(apiUrl('/api/users/' + FARMORA_USER_ID));
    if (!res.ok) return; // 404 (new user) or 503 (db down) — keep local profile
    const data = await res.json();
    if (!data.success || !data.user) return;
    const u = data.user;
    if (u.name) settingsName.value = u.name;
    if (u.primaryCrop) settingsCrop.value = u.primaryCrop;
    if (u.location && u.location.name) settingsLocation.value = u.location.name;
    if (u.language) { voiceLang = u.language; syncSettingsLangBtn(u.language); document.querySelectorAll('.lang-chip').forEach(c => c.classList.remove('active')); document.getElementById(u.language === 'ta-IN' ? 'lang-ta' : 'lang-en').classList.add('active'); }
    refreshProfileDisplay(settingsName.value, settingsLocation.value);
    try {
      localStorage.setItem('farmora_name', settingsName.value);
      localStorage.setItem('farmora_crop', settingsCrop.value);
      localStorage.setItem('farmora_location', settingsLocation.value);
    } catch (e) {}
    if (settingsLocation.value) { document.getElementById('geoBtnLabel').textContent = settingsLocation.value; if (!weatherInited) loadWeather(settingsLocation.value); }
  } catch (e) { /* server unreachable — local profile already loaded */ }
}
hydrateProfileFromBackend();

/* ---- Farms + crops ---- */
let farmsCache = [];
async function fetchFarms() {
  try {
    const res = await fetch(apiUrl('/api/farms/' + FARMORA_USER_ID));
    if (!res.ok) { farmsCache = []; return farmsCache; }
    const data = await res.json();
    farmsCache = (data.success && data.farms) ? data.farms : [];
  } catch (e) { farmsCache = []; }
  return farmsCache;
}
function cropStatusEmoji(s) { return { planned: '📝', sown: '🌱', growing: '🌾', harvested: '✅', failed: '⚠️' }[s] || '🌱'; }

function renderFarmsList() {
  const el = document.getElementById('farmsList');
  if (!farmsCache.length) {
    el.innerHTML = '<div class="card"><h3>🚜 Add your first farm</h3><p style="color:var(--soil-light);">Track farms and crops here to get more tailored advice in Chat.</p></div>';
    return;
  }
  el.innerHTML = '';
  farmsCache.forEach((farm) => {
    const isActive = farm._id === activeFarmId;
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>🚜 ${escapeHtml(farm.name)} ${isActive ? '<span class="tag" style="background:var(--paddy-light);color:var(--paddy-dark);">Active</span>' : ''}</h3>
      <p>${farm.location && farm.location.name ? '📍 ' + escapeHtml(farm.location.name) + ' · ' : ''}${farm.areaAcres ? farm.areaAcres + ' acres' : 'Area not set'}${farm.soilType ? ' · ' + escapeHtml(farm.soilType) : ''}</p>`;
    const cropsWrap = document.createElement('div'); cropsWrap.style.marginTop = '8px';
    (farm.crops || []).forEach((crop) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid var(--husk-dark);font-size:12.5px;';
      const label = document.createElement('span');
      label.textContent = `${cropStatusEmoji(crop.status)} ${crop.name}${crop.variety ? ' (' + crop.variety + ')' : ''} — ${crop.status}`;
      const btns = document.createElement('span');
      const editBtn = document.createElement('button'); editBtn.textContent = '✏️'; editBtn.title = 'Edit crop';
      editBtn.style.cssText = 'border:none;background:none;cursor:pointer;margin-right:6px;font-size:13px;';
      editBtn.onclick = () => editCrop(farm, crop);
      const delBtn = document.createElement('button'); delBtn.textContent = '🗑️'; delBtn.title = 'Remove crop';
      delBtn.style.cssText = 'border:none;background:none;cursor:pointer;font-size:13px;';
      delBtn.onclick = () => deleteCrop(farm, crop);
      btns.appendChild(editBtn); btns.appendChild(delBtn);
      row.appendChild(label); row.appendChild(btns);
      cropsWrap.appendChild(row);
    });
    card.appendChild(cropsWrap);
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
    const activeBtn = document.createElement('button'); activeBtn.className = 'quick-btn'; activeBtn.textContent = isActive ? 'Active farm' : 'Set active';
    activeBtn.onclick = () => { setActiveFarmId(farm._id); renderFarmsList(); };
    const addCropBtn = document.createElement('button'); addCropBtn.className = 'quick-btn'; addCropBtn.style.background = 'var(--turmeric)'; addCropBtn.textContent = '+ Crop';
    addCropBtn.onclick = () => addCropPrompt(farm);
    const editFarmBtn = document.createElement('button'); editFarmBtn.className = 'quick-btn'; editFarmBtn.style.background = 'var(--sky)'; editFarmBtn.textContent = 'Edit';
    editFarmBtn.onclick = () => startEditFarm(farm);
    const delFarmBtn = document.createElement('button'); delFarmBtn.className = 'danger-btn'; delFarmBtn.style.width = 'auto'; delFarmBtn.style.padding = '9px 14px'; delFarmBtn.textContent = 'Delete';
    delFarmBtn.onclick = () => deleteFarmConfirm(farm);
    actions.appendChild(activeBtn); actions.appendChild(addCropBtn); actions.appendChild(editFarmBtn); actions.appendChild(delFarmBtn);
    card.appendChild(actions);
    el.appendChild(card);
  });
}

async function initFarmsScreen() {
  document.getElementById('farmsList').innerHTML = '<div class="card"><p style="color:var(--soil-light);">Loading your farms...</p></div>';
  await fetchFarms();
  renderFarmsList();
}

const farmNameInput = document.getElementById('farmName');
const farmLocationInput = document.getElementById('farmLocation');
const farmAreaInput = document.getElementById('farmArea');
const farmSoilInput = document.getElementById('farmSoil');
const farmIrrigationInput = document.getElementById('farmIrrigation');
const farmFormIdInput = document.getElementById('farmFormId');
const farmFormTitle = document.getElementById('farmFormTitle');
const farmCancelBtn = document.getElementById('farmCancelBtn');

function resetFarmForm() {
  farmFormIdInput.value = ''; farmNameInput.value = ''; farmLocationInput.value = '';
  farmAreaInput.value = ''; farmSoilInput.value = ''; farmIrrigationInput.value = '';
  farmFormTitle.textContent = '➕ Add a farm';
  farmCancelBtn.style.display = 'none';
}
function startEditFarm(farm) {
  farmFormIdInput.value = farm._id;
  farmNameInput.value = farm.name || '';
  farmLocationInput.value = (farm.location && farm.location.name) || '';
  farmAreaInput.value = farm.areaAcres || '';
  farmSoilInput.value = farm.soilType || '';
  farmIrrigationInput.value = farm.irrigationType || '';
  farmFormTitle.textContent = '✏️ Edit farm';
  farmCancelBtn.style.display = 'inline-block';
  document.getElementById('addFarmCard').scrollIntoView({ behavior: 'smooth' });
}
farmCancelBtn.addEventListener('click', resetFarmForm);

document.getElementById('farmSaveBtn').addEventListener('click', async () => {
  const name = farmNameInput.value.trim();
  if (!name) { alert('Please enter a farm name.'); return; }
  const payload = {
    name,
    location: { name: farmLocationInput.value.trim() },
    soilType: farmSoilInput.value.trim(),
    irrigationType: farmIrrigationInput.value.trim(),
  };
  if (farmAreaInput.value) payload.areaAcres = parseFloat(farmAreaInput.value);
  try {
    let res;
    if (farmFormIdInput.value) {
      res = await fetch(apiUrl('/api/farms/' + FARMORA_USER_ID + '/' + farmFormIdInput.value), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(apiUrl('/api/farms'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ userId: FARMORA_USER_ID }, payload)),
      });
    }
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = await res.json();
    if (!data.success) throw new Error('Could not save farm.');
    if (!activeFarmId && data.farm) setActiveFarmId(data.farm._id);
    resetFarmForm();
    await fetchFarms();
    renderFarmsList();
  } catch (e) { alert('Could not save farm: ' + e.message); }
});

async function deleteFarmConfirm(farm) {
  if (!confirm('Delete "' + farm.name + '" and all its crops? This cannot be undone.')) return;
  try {
    const res = await fetch(apiUrl('/api/farms/' + FARMORA_USER_ID + '/' + farm._id), { method: 'DELETE' });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    if (activeFarmId === farm._id) setActiveFarmId(null);
    await fetchFarms();
    renderFarmsList();
  } catch (e) { alert('Could not delete farm: ' + e.message); }
}

const CROP_STATUSES = ['planned', 'sown', 'growing', 'harvested', 'failed'];
function addCropPrompt(farm) {
  const name = prompt('Crop name (e.g. Paddy):');
  if (!name || !name.trim()) return;
  const variety = prompt('Variety (optional):') || '';
  let status = (prompt('Status — planned, sown, growing, harvested, or failed:', 'sown') || 'sown').trim();
  if (!CROP_STATUSES.includes(status)) status = 'sown';
  saveCrop(farm, null, { name: name.trim(), variety: variety.trim(), status });
}
function editCrop(farm, crop) {
  const name = prompt('Crop name:', crop.name);
  if (!name || !name.trim()) return;
  const variety = prompt('Variety:', crop.variety || '') || '';
  let status = (prompt('Status — planned, sown, growing, harvested, or failed:', crop.status) || crop.status).trim();
  if (!CROP_STATUSES.includes(status)) status = crop.status;
  saveCrop(farm, crop._id, { name: name.trim(), variety: variety.trim(), status });
}
async function saveCrop(farm, cropId, payload) {
  try {
    const url = cropId
      ? apiUrl('/api/farms/' + FARMORA_USER_ID + '/' + farm._id + '/crops/' + cropId)
      : apiUrl('/api/farms/' + FARMORA_USER_ID + '/' + farm._id + '/crops');
    const res = await fetch(url, { method: cropId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    await fetchFarms();
    renderFarmsList();
  } catch (e) { alert('Could not save crop: ' + e.message); }
}
async function deleteCrop(farm, crop) {
  if (!confirm('Remove crop "' + crop.name + '"?')) return;
  try {
    const res = await fetch(apiUrl('/api/farms/' + FARMORA_USER_ID + '/' + farm._id + '/crops/' + crop._id), { method: 'DELETE' });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    await fetchFarms();
    renderFarmsList();
  } catch (e) { alert('Could not delete crop: ' + e.message); }
}

/* ---- Chat history (opt-in, not auto-dumped into the chat window) ---- */
let chatHistoryOpen = false;
document.getElementById('viewHistoryBtn').addEventListener('click', async () => {
  const el = document.getElementById('chatHistoryList');
  chatHistoryOpen = !chatHistoryOpen;
  if (!chatHistoryOpen) { el.innerHTML = ''; return; }
  el.innerHTML = '<p style="color:var(--soil-light);font-size:12.5px;">Loading...</p>';
  try {
    const res = await fetch(apiUrl('/api/chats/' + FARMORA_USER_ID + '?limit=15'));
    if (!res.ok) { el.innerHTML = '<p style="color:var(--soil-light);font-size:12.5px;">No history available right now.</p>'; return; }
    const data = await res.json();
    const chats = (data.success && data.chats) || [];
    if (!chats.length) { el.innerHTML = '<p style="color:var(--soil-light);font-size:12.5px;">No previous conversations yet.</p>'; return; }
    el.innerHTML = '';
    chats.forEach((c) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:8px 0;border-top:1px solid var(--husk-dark);font-size:12.5px;';
      row.innerHTML = `<div style="font-weight:600;color:var(--soil);">🧑‍🌾 ${escapeHtml((c.message || '').slice(0, 100))}</div>
        <div style="color:var(--soil-light);margin-top:2px;">🌾 ${escapeHtml((c.response || '').slice(0, 140))}${(c.response || '').length > 140 ? '…' : ''}</div>
        <div style="font-size:10.5px;color:#9AAE9D;margin-top:2px;">${timeAgo(c.createdAt)}</div>`;
      el.appendChild(row);
    });
  } catch (e) { el.innerHTML = '<p style="color:var(--soil-light);font-size:12.5px;">No history available right now.</p>'; }
});