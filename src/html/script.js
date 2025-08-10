// ===== Icons for celebrations =====
const eventIcons = {
  birthday: 'fa-birthday-cake',
  valentine: 'fa-heart',
  namesday: 'fa-user',
  christmas: 'fa-tree',
  wedding: 'fa-ring',
};

// ===== Global state (achievements + filtering) =====
let ALL_ACH = [];
let ASSETS_BASE = '';
let CHIPS_TYPES = [];
let HAS_UNTAGGED = false;
let SELECTED_TYPES = new Set();
const FILTER_KEY = 'wc_type_filter_v2';
let FIRST_IMG = new Map();
let MAP_ACH = new Map();

// ===== Chart tooltip pinning state =====
let TOOLTIP_PINNED = false;
let PINNED_DATA = null;
let PINNED_POS = null;
let LAST_TOOLTIP_POS = null;

// ===== Lightbox state =====
let lightboxState = { images: [], index: 0 };
let achievementsChart = null;

// ===== Theme =====
const THEME_KEY = 'wc_theme';

// ===== Safe helpers =====
const $ = (sel) => document.querySelector(sel);
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

// ===== Theme helpers =====
function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark' : 'light';
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  updateThemeToggleIcon(theme);
  if (achievementsChart) achievementsChart.resize();
}
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function updateThemeToggleIcon(theme) {
  const icon = $('#themeToggle i');
  const btn  = $('#themeToggle');
  if (!icon || !btn) return;
  icon.classList.remove('fa-sun', 'fa-moon');
  if (theme === 'dark') {
    icon.classList.add('fa-sun');  btn.setAttribute('aria-label', 'Switch to light mode');  btn.title = 'Switch to light mode';
  } else {
    icon.classList.add('fa-moon'); btn.setAttribute('aria-label', 'Switch to dark mode');   btn.title = 'Switch to dark mode';
  }
}

// ===== Type helpers (chips) =====
function normTypes(val) {
  let arr = [];
  if (Array.isArray(val)) arr = val;
  else if (typeof val === 'string') arr = val.split(/[,\|]/);
  return arr.map(s => s.trim().toLowerCase()).filter(Boolean);
}
function titlecase(s) { return String(s).replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/[-_]/g, ' '); }
function restoreChipSelection() {
  try { const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return new Set(['__all']);
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return new Set(arr);
  } catch {}
  return new Set(['__all']);
}
function persistChipSelection() {
  if (SELECTED_TYPES.has('__all')) localStorage.setItem(FILTER_KEY, JSON.stringify(['__all']));
  else localStorage.setItem(FILTER_KEY, JSON.stringify(Array.from(SELECTED_TYPES)));
}
function makeChip(value, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.setAttribute('data-value', value);
  btn.setAttribute('aria-pressed', SELECTED_TYPES.has(value) ? 'true' : 'false');
  btn.textContent = label;
  btn.addEventListener('click', () => {
    if (value === '__all') SELECTED_TYPES = new Set(['__all']);
    else {
      SELECTED_TYPES.delete('__all');
      if (SELECTED_TYPES.has(value)) SELECTED_TYPES.delete(value); else SELECTED_TYPES.add(value);
      if (SELECTED_TYPES.size === 0) SELECTED_TYPES.add('__all');
    }
    persistChipSelection();
    updateChipPressedStates();
    renderFiltered();
  });
  return btn;
}
function updateChipPressedStates() {
  const chipsHost = document.getElementById('typeChips');
  if (!chipsHost) return;
  chipsHost.querySelectorAll('.chip').forEach(chip => {
    const v = chip.getAttribute('data-value');
    chip.setAttribute('aria-pressed', SELECTED_TYPES.has(v) ? 'true' : 'false');
  });
}
function setupTypeChips(items) {
  const wrap = document.getElementById('typeFilter');
  const chipsHost = document.getElementById('typeChips');
  if (!wrap || !chipsHost) return;

  const set = new Set();
  HAS_UNTAGGED = false;
  items.forEach(a => {
    const t = normTypes(a.type);
    if (t.length === 0) HAS_UNTAGGED = true;
    t.forEach(x => set.add(x));
  });
  CHIPS_TYPES = Array.from(set).sort();

  const shouldShow = (CHIPS_TYPES.length > 1) || HAS_UNTAGGED;
  if (!shouldShow) { wrap.hidden = true; return; }

  SELECTED_TYPES = restoreChipSelection();
  chipsHost.innerHTML = '';
  chipsHost.appendChild(makeChip('__all', 'All'));
  CHIPS_TYPES.forEach(t => chipsHost.appendChild(makeChip(t, titlecase(t))));
  if (HAS_UNTAGGED) chipsHost.appendChild(makeChip('__untagged', 'Untagged'));
  updateChipPressedStates();
  wrap.hidden = false;
}
function getFilteredAchievements() {
  if (SELECTED_TYPES.has('__all')) return ALL_ACH;
  return ALL_ACH.filter(a => {
    const tags = normTypes(a.type);
    const matchTagged = tags.some(t => SELECTED_TYPES.has(t));
    const matchUntagged = (tags.length === 0 && SELECTED_TYPES.has('__untagged'));
    return matchTagged || matchUntagged;
  });
}
function renderFiltered() {
  const items = getFilteredAchievements();
  renderAchievements(items, ASSETS_BASE);
  renderAchievementsChart(items);
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  setTheme(preferredTheme());
  on($('#themeToggle'), 'click', () => setTheme(currentTheme() === 'light' ? 'dark' : 'light'));

  // Esc closes lightbox or unpins tooltip
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      const lb = $('#lightbox');
      if (lb && !lb.hidden) { closeLightbox(); return; }
      if (TOOLTIP_PINNED) { unpinTooltip(); }
    }
  });

  // Tabs & views
  const tabsContainer     = $('.tabs');
  const tabCelebrations   = $('#tab-celebrations');
  const tabAchievements   = $('#tab-achievements');
  const viewCelebrations  = $('#view-celebrations');
  const viewAchievements  = $('#view-achievements');

  on(tabCelebrations, 'click', () => {
    activateTab(tabCelebrations, viewCelebrations);
    deactivateTab(tabAchievements, viewAchievements);
    if (achievementsChart) achievementsChart.resize();
  });
  on(tabAchievements, 'click', () => {
    activateTab(tabAchievements, viewAchievements);
    deactivateTab(tabCelebrations, viewCelebrations);
    if (achievementsChart) achievementsChart.resize();
  });

  // Lightbox
  on($('#lightboxClose'), 'click', closeLightbox);
  on($('#lightboxPrev'),  'click', () => navLightbox(-1));
  on($('#lightboxNext'),  'click', () => navLightbox(1));
  on($('#lightbox'), 'click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });

  // Load data & render
  const bust = Date.now();
  fetch(`celebrations.yaml?t=${bust}`, { cache: 'no-store' })
    .then(r => r.text())
    .then(yamlText => {
      const data = jsyaml.load(yamlText) || {};
      const celebrations = Array.isArray(data.celebrations) ? data.celebrations : [];
      const achievements = Array.isArray(data.achievements) ? data.achievements : [];

      const assetsBase = ensureTrailingSlash(
        typeof data.assets_base_path === 'string' ? data.assets_base_path : '/data/'
      );

      const siteTitle = (typeof data.site_title === 'string' && data.site_title.trim())
        ? data.site_title.trim() : 'Web-Celebration';
      document.title = siteTitle;

      const intro = (typeof data.intro === 'string') ? data.intro : '';
      const introEl = $('#introText'); if (introEl && intro.trim()) introEl.innerHTML = linkify(intro);

      const haveCelebrations = celebrations.length > 0;
      const haveAchievements = achievements.length > 0;
      if (haveCelebrations) renderCalendar(celebrations);

      ALL_ACH = achievements;
      ASSETS_BASE = assetsBase;

      if (haveAchievements) {
        setupTypeChips(ALL_ACH);
        renderFiltered();
      }

      adaptUI({
        haveCelebrations, haveAchievements,
        tabsContainer, tabCelebrations, tabAchievements,
        viewCelebrations, viewAchievements
      });
    })
    .catch(err => console.error('Error loading YAML:', err));
});

// ===== UI adaptation =====
function adaptUI(ctx) {
  const {
    haveCelebrations, haveAchievements,
    tabsContainer, tabCelebrations, tabAchievements,
    viewCelebrations, viewAchievements
  } = ctx;

  if (!haveCelebrations && tabCelebrations && viewCelebrations) {
    tabCelebrations.style.display = 'none';
    viewCelebrations.classList.remove('active');
    viewCelebrations.style.display = 'none';
  }
  if (!haveAchievements && tabAchievements && viewAchievements) {
    tabAchievements.style.display = 'none';
    viewAchievements.classList.remove('active');
    viewAchievements.style.display = 'none';
  }

  if (!haveCelebrations && !haveAchievements) {
    if (tabsContainer) tabsContainer.style.display = 'none';
    const main = $('.container');
    if (main) {
      const empty = document.createElement('div');
      empty.style.margin = '24px 0';
      empty.style.color = 'var(--muted)';
      empty.textContent = 'No celebrations or achievements to show.';
      main.appendChild(empty);
    }
    return;
  }

  if (haveCelebrations && !haveAchievements) {
    if (tabCelebrations && viewCelebrations) activateTab(tabCelebrations, viewCelebrations);
    if (tabsContainer) tabsContainer.style.display = 'none';
  } else if (!haveCelebrations && haveAchievements) {
    if (tabAchievements && viewAchievements) activateTab(tabAchievements, viewAchievements);
    if (tabsContainer) tabsContainer.style.display = 'none';
  } else {
    if (tabCelebrations && tabAchievements && viewCelebrations && viewAchievements) {
      if (!tabCelebrations.classList.contains('active') &&
          !tabAchievements.classList.contains('active')) {
        activateTab(tabCelebrations, viewCelebrations);
        deactivateTab(tabAchievements, viewAchievements);
      }
    }
  }
}

// ===== Global, fixed tooltip handler =====
function externalTooltipHandler(context) {
  const { chart, tooltip } = context;

  let el = document.getElementById('chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chart-tooltip';
    el.className = 'chart-tooltip';
    el.style.opacity = '0';
    document.body.appendChild(el);
  }

  const rect = chart.canvas.getBoundingClientRect();

  if (!TOOLTIP_PINNED && tooltip.opacity === 0) {
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    return;
  }

  let raw, anchorLeft, anchorTop;
  if (TOOLTIP_PINNED && PINNED_DATA && PINNED_POS) {
    raw = PINNED_DATA;
    anchorLeft = PINNED_POS.left;
    anchorTop  = PINNED_POS.top;
  } else {
    const dp = tooltip.dataPoints && tooltip.dataPoints[0];
    raw = dp ? dp.raw : null;
    anchorLeft = rect.left + tooltip.caretX;
    anchorTop  = rect.top  + tooltip.caretY;
    LAST_TOOLTIP_POS = { left: anchorLeft, top: anchorTop };
  }

  if (!raw) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; return; }

  const title = raw.title || '';
  const descHtml = linkify(raw.description || '');
  const img = FIRST_IMG.get(raw.key) || '';

  el.innerHTML = `
    <button class="ct-close" aria-label="Close tooltip">&times;</button>
    <div class="ct-head">${escapeHTML(title)}</div>
    <div class="ct-body">
      ${img ? `<img class="ct-img" src="${img}" alt="${escapeHTML(title)}">` : `<div></div>`}
      <div class="ct-text">${descHtml || '<em>No description</em>'}</div>
    </div>
  `;

  const closeBtn = el.querySelector('.ct-close');
  if (closeBtn) closeBtn.onclick = (ev) => { ev.preventDefault(); unpinTooltip(); };

  const imgEl = el.querySelector('.ct-img');
  if (imgEl) { imgEl.onclick = (ev) => { ev.stopPropagation(); openGalleryForKey(raw.key); }; }

  // Position within viewport (fixed)
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = anchorTop - th - pad;
  if (top < 4) top = anchorTop + pad;

  let left = anchorLeft - tw / 2;
  if (left < 4) left = 4;
  if (left + tw > vw - 4) left = vw - tw - 4;
  if (top + th > vh - 4) top = Math.max(4, vh - th - 4);

  el.style.left = `${Math.round(left)}px`;
  el.style.top  = `${Math.round(top)}px`;
  el.style.opacity = '1';
  el.style.pointerEvents = TOOLTIP_PINNED ? 'auto' : 'none';
}

// ===== Tabs helpers =====
function activateTab(tabBtn, viewEl) {
  if (!tabBtn || !viewEl) return;
  tabBtn.classList.add('active');
  tabBtn.setAttribute('aria-selected', 'true');
  viewEl.classList.add('active');
  viewEl.style.display = 'block';
}
function deactivateTab(tabBtn, viewEl) {
  if (!tabBtn || !viewEl) return;
  tabBtn.classList.remove('active');
  tabBtn.setAttribute('aria-selected', 'false');
  viewEl.classList.remove('active');
  viewEl.style.display = 'none';
}

// ===== Celebrations =====
function renderCalendar(events) {
  const calendar = $('#calendar');
  if (!calendar) return;
  calendar.innerHTML = '';

  const today = new Date();
  const currentYear = today.getFullYear();

  const processed = events.map(event => {
    let [day, month, year] = String(event.date || '').split('.');
    const dd = parseInt(day, 10);
    const mm = parseInt(month, 10) - 1;
    let yy = parseInt(year, 10);

    if (!Number.isFinite(yy)) yy = currentYear;
    else if (year && year.length === 2) yy = yy <= 69 ? 2000 + yy : 1900 + yy;

    let eventDate = new Date(currentYear, mm, dd);
    if (isNaN(eventDate.getTime())) eventDate = new Date(currentYear, 0, 1);
    else if (eventDate < today) eventDate.setFullYear(currentYear + 1);

    return { ...event, eventDate };
  });

  processed.sort((a, b) => a.eventDate - b.eventDate);

  processed.forEach((event, index) => {
    const eventDiv = document.createElement('div');
    eventDiv.classList.add('event', index % 2 === 0 ? 'left' : 'right');

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const icon = document.createElement('i');
    icon.classList.add('fa-solid', eventIcons[event.type] || 'fa-star', 'icon');
    contentDiv.appendChild(icon);

    const title = document.createElement('div');
    title.classList.add('title');
    title.textContent = capitalizeFirstLetter(event.type || 'event');
    contentDiv.appendChild(title);

    const name = document.createElement('div');
    name.classList.add('name');
    name.textContent = event.name || '';
    contentDiv.appendChild(name);

    const date = document.createElement('div');
    date.classList.add('date');
    date.textContent = formatDate(event.eventDate);
    contentDiv.appendChild(date);

    eventDiv.appendChild(contentDiv);
    calendar.appendChild(eventDiv);
  });
}

// ===== Achievements (list + gallery) =====
function achKey(a) { return `${slugify(a.title || '')}_${(a.date || '').trim()}`; }
function clampWeight(v) { const n = Number(v); if (!Number.isFinite(n)) return null; return Math.max(1, Math.min(5, Math.round(n))); }
function starsHTML(weight) {
  const w = clampWeight(weight) || 0;
  let html = '<div class="stars" aria-label="Weight: ' + w + ' out of 5">';
  for (let i = 1; i <= 5; i++) {
    html += i <= w
      ? '<i class="fa-solid fa-star fill" aria-hidden="true"></i>'
      : '<i class="fa-regular fa-star" aria-hidden="true"></i>';
  }
  html += '</div>';
  return html;
}

function renderAchievements(items, assetsBase) {
  const container = $('#achievementsList');
  if (!container) return;
  container.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--muted)';
    empty.style.fontSize = '14px';
    empty.textContent = 'No achievements match this filter.';
    container.appendChild(empty);
    return;
  }

  const parsed = items
    .map(a => ({ ...a, parsedDate: parseDDMMYYYY(a.date) }))
    .sort((a, b) => (b.parsedDate?.getTime() || 0) - (a.parsedDate?.getTime() || 0));

  parsed.forEach((a, idx) => {
    const card = document.createElement('article');
    card.classList.add('ach-card');

    const key = achKey(a);
    card.id = 'ach-' + key;
    card.dataset.key = key;
    MAP_ACH.set(key, a);

    const header = document.createElement('div');
    header.classList.add('ach-header');

    const h3 = document.createElement('h3');
    h3.textContent = a.title || `Achievement #${idx + 1}`;
    header.appendChild(h3);

    const meta = document.createElement('div');
    meta.classList.add('ach-meta');
    meta.innerHTML = `
      <i class="fa-regular fa-calendar"></i>
      <span>${a.parsedDate ? a.parsedDate.toLocaleDateString() : (a.date || '')}</span>
    `;
    header.appendChild(meta);

    const w = clampWeight(a.weight ?? (a.xy && a.xy.y));
    if (w) {
      const stars = document.createElement('div');
      stars.innerHTML = starsHTML(w);
      header.appendChild(stars.firstChild);
    }

    card.appendChild(header);

    if (a.description) {
      const desc = document.createElement('p');
      desc.classList.add('ach-desc');
      desc.innerHTML = linkify(a.description);
      card.appendChild(desc);
    }

    const gallery = document.createElement('div');
    gallery.classList.add('gallery');
    card.appendChild(gallery);

    if (Array.isArray(a.images) && a.images.length) {
      const resolved = a.images.map(src => resolveImageSrc(src, assetsBase));
      if (resolved.length) FIRST_IMG.set(key, resolved[0]);
      buildGallery(gallery, resolved, a.title);
    } else {
      const folder = slugify(a.title || `achievement-${idx + 1}`);
      const manifestUrl = `/_gallery/${folder}.json?t=${Date.now()}`;
      const dirUrl      = ensureTrailingSlash(assetsBase) + folder + '/';

      const placeholder = document.createElement('div');
      placeholder.textContent = 'Loading images…';
      placeholder.style.color = 'var(--muted)';
      placeholder.style.fontSize = '14px';
      gallery.appendChild(placeholder);

      fetch(manifestUrl, { cache: 'no-store' })
        .then(res => { if (!res.ok) throw new Error(`manifest ${res.status}`); return res.json(); })
        .then(json => Array.isArray(json.images) ? json.images : [])
        .catch(() => [])
        .then(async (images) => {
          if (images.length) return images;
          try { return await listImagesInDir(dirUrl); } catch { return []; }
        })
        .then(images => {
          gallery.innerHTML = '';
          if (!images.length) {
            const empty = document.createElement('div');
            empty.textContent = 'No images found.';
            empty.style.color = 'var(--muted)';
            empty.style.fontSize = '14px';
            gallery.appendChild(empty);
            return;
          }
          FIRST_IMG.set(key, images[0]);
          buildGallery(gallery, images, a.title);
        })
        .catch(err => {
          console.error('Gallery load failed:', err);
          gallery.innerHTML = '';
          const e = document.createElement('div');
          e.textContent = 'Could not load images.';
          e.style.color = 'var(--muted)';
          e.style.fontSize = '14px';
          gallery.appendChild(e);
        });
    }

    container.appendChild(card);
  });
}

function buildGallery(container, imageUrls, title = 'Achievement') {
  const resolvedImages = imageUrls.slice();
  resolvedImages.forEach((src, i) => {
    const btn = document.createElement('button');
    btn.classList.add('thumb');
    btn.setAttribute('aria-label', `Open image ${i + 1} for ${title}`);

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = src;
    img.alt = `${title} image ${i + 1}`;

    btn.appendChild(img);
    btn.addEventListener('click', () => openLightbox(resolvedImages, i));
    container.appendChild(btn);
  });
}

// ===== Directory listing =====
async function listImagesInDir(dirUrl) {
  const res = await fetch(dirUrl, { headers: { 'Accept': 'text/html' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a'));
  const files = anchors.map(a => a.getAttribute('href') || '')
    .filter(h => h && !h.endsWith('/'))
    .filter(isImageFile);
  return files.map(h => new URL(h, dirUrl).toString());
}
function isImageFile(name) { return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name); }

// ===== Chart (Month-resolution X; Weight 1–5 Y) =====
function prefetchFirstImages(items, assetsBase) {
  const tasks = items.map(a => {
    const key = achKey(a);
    if (FIRST_IMG.has(key)) return Promise.resolve();
    return fetchFirstImage(a, assetsBase).then(u => { if (u) FIRST_IMG.set(key, u); });
  });
  return Promise.allSettled(tasks);
}
function fetchFirstImage(a, assetsBase) {
  if (Array.isArray(a.images) && a.images.length) {
    return Promise.resolve(resolveImageSrc(a.images[0], assetsBase));
  }
  const folder = slugify(a.title || 'achievement');
  const manifestUrl = `/_gallery/${folder}.json?t=${Date.now()}`;
  const dirUrl = ensureTrailingSlash(assetsBase) + folder + '/';
  return fetch(manifestUrl, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : Promise.reject()))
    .then(j => (Array.isArray(j.images) && j.images.length ? j.images[0] : null))
    .catch(() => listImagesInDir(dirUrl).then(arr => (arr[0] || null)))
    .catch(() => null);
}

// NEW: fractional-year helpers for month-level axis
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fractionalYear(d) {
  const y = d.getFullYear();
  const m = d.getMonth();        // 0..11
  const days = new Date(y, m + 1, 0).getDate();
  const day = d.getDate();
  const frac = m / 12 + ((day - 1) / days) / 12;  // month + day fraction
  return y + frac;
}
function labelFromFractionalYear(v) {
  const y = Math.floor(v);
  let rem = v - y;
  if (rem < 0) rem = 0;
  // avoid rounding up to 12
  let idx = Math.floor(rem * 12 + 1e-6);
  if (idx > 11) idx = 11;
  return `${MONTH_ABBR[idx]} ${y}`;
}

function renderAchievementsChart(items) {
  const canvas = document.getElementById('achievementsChart');
  const note   = document.getElementById('chartNote');
  if (!canvas) return;
  if (achievementsChart) { achievementsChart.destroy(); achievementsChart = null; }

  prefetchFirstImages(items, ASSETS_BASE).finally(() => {
    const points = items.map(a => {
      const d = parseDDMMYYYY(a.date);
      if (!d) return null;
      const x = fractionalYear(d);           // <— month resolution
      let y = Number(a.weight);
      if (!Number.isFinite(y) && a.xy && isFinite(+a.xy.y)) y = Number(a.xy.y); // legacy
      if (!Number.isFinite(y)) return null;
      y = Math.max(1, Math.min(5, Math.round(y)));
      return { x, y, title: a.title || '', description: a.description || '', key: achKey(a) };
    }).filter(Boolean);

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: externalTooltipHandler }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Month' },
          ticks: {
            stepSize: 1/12,                    // monthly ticks
            callback: (v) => labelFromFractionalYear(v),
            autoSkip: true,
            maxTicksLimit: 24                   // keep labels readable
          },
          grid: { drawTicks: true }
        },
        y: { title: { display: true, text: 'Weight (1–5)' }, min: 0.5, max: 5.5, ticks: { stepSize: 1 } }
      },
      onHover: (evt, activeEls, chart) => {
        chart.canvas.style.cursor = (activeEls && activeEls.length) ? 'pointer' : 'default';
      },
      onClick: (evt, activeEls, chart) => {
        if (!activeEls || !activeEls.length) { unpinTooltip(); return; }
        const { datasetIndex, index } = activeEls[0];
        const raw = chart.data.datasets[datasetIndex].data[index];

        TOOLTIP_PINNED = true;
        PINNED_DATA = raw;

        const rect = chart.canvas.getBoundingClientRect();
        if (!LAST_TOOLTIP_POS) {
          const el = activeEls[0].element;
          PINNED_POS = { left: rect.left + el.x, top: rect.top + el.y };
        } else {
          PINNED_POS = { ...LAST_TOOLTIP_POS };
        }

        externalTooltipHandler({
          chart,
          tooltip: {
            opacity: 1,
            caretX: PINNED_POS.left - rect.left,
            caretY: PINNED_POS.top - rect.top,
            dataPoints: [{ raw }]
          }
        });

        scrollToCard(raw.key);
      }
    };

    if (points.length) {
      const xs = points.map(p => p.x);
      opts.scales.x.min = Math.min(...xs) - 1/24;  // half-month padding
      opts.scales.x.max = Math.max(...xs) + 1/24;

      achievementsChart = new Chart(canvas, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Achievements',
            data: points,
            pointStyle: 'star',
            pointRadius: 10,                 // larger stars
            pointHoverRadius: 13,
            hitRadius: 16,
            borderWidth: 2,
            pointBackgroundColor: '#f1c40f', // yellow stars
            pointBorderColor: '#f1c40f',
            pointHoverBackgroundColor: '#f1c40f',
            pointHoverBorderColor: '#f1c40f'
          }]
        },
        options: opts
      });
      if (note) note.textContent = 'Scatter: Month (by date) vs Weight (1–5). Hover or click a point.';
    } else {
      const byMonth = {};
      items.forEach(a => {
        const d = parseDDMMYYYY(a.date);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      });
      const labels = Object.keys(byMonth).sort();
      const counts = labels.map(k => byMonth[k]);

      achievementsChart = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Achievements per Month', data: counts }] },
        options: opts
      });
      if (note) note.textContent = 'No weights found; showing achievements per month.';
    }
  });
}

// Pin/unpin + navigation helpers
function unpinTooltip() {
  TOOLTIP_PINNED = false;
  PINNED_DATA = null;
  PINNED_POS = null;
  const el = document.getElementById('chart-tooltip');
  if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
}
function scrollToCard(key) {
  const el = document.getElementById('ach-' + key);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
}
async function getAllImagesForKey(key) {
  const a = MAP_ACH.get(key);
  if (!a) return [];
  if (Array.isArray(a.images) && a.images.length) {
    return a.images.map(src => resolveImageSrc(src, ASSETS_BASE));
  }
  const folder = slugify(a.title || 'achievement');
  const manifestUrl = `/_gallery/${folder}.json?t=${Date.now()}`;
  const dirUrl = ensureTrailingSlash(ASSETS_BASE) + folder + '/';
  try { const r = await fetch(manifestUrl, { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.images) && j.images.length) return j.images; }
  } catch {}
  try { return await listImagesInDir(dirUrl); } catch { return []; }
}
async function openGalleryForKey(key) {
  const imgs = await getAllImagesForKey(key);
  if (imgs.length) openLightbox(imgs, 0);
}

// ===== Lightbox =====
function openLightbox(images, index = 0) {
  lightboxState.images = images || [];
  lightboxState.index = Math.max(0, Math.min(index, images.length - 1));
  updateLightbox();
  const lb = $('#lightbox');
  if (lb) { lb.hidden = false; document.body.style.overflow = 'hidden'; }
}
function closeLightbox() {
  const lb = $('#lightbox');
  if (lb) { lb.hidden = true; document.body.style.overflow = ''; }
}
function navLightbox(delta) {
  if (!lightboxState.images.length) return;
  lightboxState.index = (lightboxState.index + delta + lightboxState.images.length) % lightboxState.images.length;
  updateLightbox();
}
function updateLightbox() {
  const img = $('#lightboxImg');
  if (img) img.src = lightboxState.images[lightboxState.index];
}

// ===== Linkify =====
function escapeHTML(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function linkify(text) {
  if (!text) return '';
  let s = escapeHTML(text);
  s = s.replace(/\bhttps?:\/\/[^\s<)]+/gi, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
  s = s.replace(/(^|[\s(])(www\.[^\s<)]+)/gi, (_full, lead, host) => `${lead}<a href="https://${host}" target="_blank" rel="noopener noreferrer">${host}</a>`);
  s = s.replace(/\n/g, '<br>');
  return s;
}

// ===== Utils =====
function formatDate(date) { return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }); }
function capitalizeFirstLetter(str) { if (!str || typeof str !== 'string') return ''; return str.charAt(0).toUpperCase() + str.slice(1); }
function parseDDMMYYYY(s) {
  if (!s || typeof s !== 'string') return null;
  const parts = s.split('.');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parts[2] ? parts[2].trim() : '';
  let yy = parseInt(year, 10);
  if (!Number.isFinite(yy)) yy = new Date().getFullYear();
  else if (year.length === 2) yy = yy <= 69 ? 2000 + yy : 1900 + yy;
  const d = new Date(yy, month, day);
  return isNaN(d.getTime()) ? null : d;
}
function ensureTrailingSlash(p) { if (!p) return '/'; return p.endsWith('/') ? p : p + '/'; }
function resolveImageSrc(src, base) { if (!src) return ''; if (/^([a-z]+:)?\/\//i.test(src) || src.startsWith('/')) return src; return ensureTrailingSlash(base) + src.replace(/^\.?\//, ''); }
function slugify(str) { return String(str || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
