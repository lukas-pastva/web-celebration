// ===== Icons for celebrations =====
const eventIcons = {
  birthday: 'fa-birthday-cake',
  valentine: 'fa-heart',
  namesday: 'fa-user',
  christmas: 'fa-tree',
  wedding: 'fa-ring',
};

let ALL_ACH = [];
let ASSETS_BASE = '';
let CHIPS_TYPES = [];       // discovered normalized types
let HAS_UNTAGGED = false;
let SELECTED_TYPES = new Set();
const FILTER_KEY = 'wc_type_filter_v2';
let FIRST_IMG = new Map();        // key -> first image URL

// ===== State =====
let lightboxState = { images: [], index: 0 };
let achievementsChart = null; // prevent duplicate charts
const THEME_KEY = 'wc_theme';

// ===== Safe helpers =====
const $ = (sel) => document.querySelector(sel);
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); } // null-safe

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
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}
function updateThemeToggleIcon(theme) {
  const icon = $('#themeToggle i');
  const btn  = $('#themeToggle');
  if (!icon || !btn) return;
  icon.classList.remove('fa-sun', 'fa-moon');
  if (theme === 'dark') {
    icon.classList.add('fa-sun');
    btn.setAttribute('aria-label', 'Switch to light mode');
    btn.title = 'Switch to light mode';
  } else {
    icon.classList.add('fa-moon');
    btn.setAttribute('aria-label', 'Switch to dark mode');
    btn.title = 'Switch to dark mode';
  }
}
function normTypes(val) {
  let arr = [];
  if (Array.isArray(val)) arr = val;
  else if (typeof val === 'string') arr = val.split(/[,\|]/);
  return arr.map(s => s.trim().toLowerCase()).filter(Boolean);
}
function titlecase(s) {
  return String(s).replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/[-_]/g, ' ');
}
function getFilteredAchievements() {
  const select = document.getElementById('typeSelect');
  const sel = select ? select.value : '__all';
  if (sel === '__all') return ALL_ACH;
  if (sel === '__untagged') return ALL_ACH.filter(a => normTypes(a.type).length === 0);
  return ALL_ACH.filter(a => normTypes(a.type).includes(sel));
}

function renderFiltered() {
  const items = getFilteredAchievements();
  renderAchievements(items, ASSETS_BASE);
  renderAchievementsChart(items);
}

function setupTypeChips(items) {
  const wrap = document.getElementById('typeFilter');
  const chipsHost = document.getElementById('typeChips');
  if (!wrap || !chipsHost) return;

  // Discover types
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

  // Restore selection
  SELECTED_TYPES = restoreChipSelection();

  // Build chips
  chipsHost.innerHTML = '';
  // "All" convenience chip
  chipsHost.appendChild(makeChip('__all', 'All'));

  CHIPS_TYPES.forEach(t => chipsHost.appendChild(makeChip(t, titlecase(t))));
  if (HAS_UNTAGGED) chipsHost.appendChild(makeChip('__untagged', 'Untagged'));

  // Reflect selection
  updateChipPressedStates();
  wrap.hidden = false;
}

function makeChip(value, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.setAttribute('data-value', value);
  btn.setAttribute('aria-pressed', SELECTED_TYPES.has(value) ? 'true' : 'false');
  btn.textContent = label;

  btn.addEventListener('click', () => {
    if (value === '__all') {
      // Selecting "All" deselects others
      SELECTED_TYPES = new Set(['__all']);
    } else {
      // Toggle value
      SELECTED_TYPES.delete('__all');
      if (SELECTED_TYPES.has(value)) SELECTED_TYPES.delete(value);
      else SELECTED_TYPES.add(value);

      // If nothing left, revert to "All"
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
  const chips = chipsHost.querySelectorAll('.chip');
  chips.forEach(chip => {
    const v = chip.getAttribute('data-value');
    chip.setAttribute('aria-pressed', SELECTED_TYPES.has(v) ? 'true' : 'false');
  });
}

function persistChipSelection() {
  if (SELECTED_TYPES.has('__all')) {
    localStorage.setItem(FILTER_KEY, JSON.stringify(['__all']));
  } else {
    localStorage.setItem(FILTER_KEY, JSON.stringify(Array.from(SELECTED_TYPES)));
  }
}

function restoreChipSelection() {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return new Set(['__all']);
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return new Set(arr);
  } catch {}
  return new Set(['__all']);
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
function achKey(a) {
  return `${slugify(a.title || '')}_${(a.date || '').trim()}`;
}

function fetchFirstImage(a, assetsBase) {
  // 1) explicit images
  if (Array.isArray(a.images) && a.images.length) {
    return Promise.resolve(resolveImageSrc(a.images[0], assetsBase));
  }
  // 2) manifest, then autoindex fallback
  const folder = slugify(a.title || 'achievement');
  const manifestUrl = `/_gallery/${folder}.json?t=${Date.now()}`;
  const dirUrl = ensureTrailingSlash(assetsBase) + folder + '/';

  return fetch(manifestUrl, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : Promise.reject()))
    .then(j => (Array.isArray(j.images) && j.images.length ? j.images[0] : null))
    .catch(() => listImagesInDir(dirUrl).then(arr => (arr[0] || null)))
    .catch(() => null);
}

function prefetchFirstImages(items, assetsBase) {
  const tasks = items.map(a => {
    const key = achKey(a);
    if (FIRST_IMG.has(key)) return Promise.resolve();
    return fetchFirstImage(a, assetsBase).then(u => { if (u) FIRST_IMG.set(key, u); });
  });
  return Promise.allSettled(tasks);
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  // Theme (guarded)
  setTheme(preferredTheme());
  on($('#themeToggle'), 'click', () => setTheme(currentTheme() === 'light' ? 'dark' : 'light'));
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      const lb = $('#lightbox');
      if (lb && !lb.hidden) closeLightbox();
    }
  });
  // Tabs & views (guarded)
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

  // Lightbox (guarded)
  on($('#lightboxClose'), 'click', closeLightbox);
  on($('#lightboxPrev'),  'click', () => navLightbox(-1));
  on($('#lightboxNext'),  'click', () => navLightbox(1));
  on($('#lightbox'), 'click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });

  // Load data (cache-busted) & render
  const bust = Date.now();
  fetch(`celebrations.yaml?t=${bust}`, { cache: 'no-store' })
    .then(r => r.text())
    .then(yamlText => {
      // after we parse YAML:
      const data = jsyaml.load(yamlText) || {};
      const celebrations = Array.isArray(data.celebrations) ? data.celebrations : [];
      const achievements = Array.isArray(data.achievements) ? data.achievements : [];

      const assetsBase = ensureTrailingSlash(
        typeof data.assets_base_path === 'string' ? data.assets_base_path : '/data/'
      );

      // Set site title + intro (you already added earlier)
      const siteTitle = (typeof data.site_title === 'string' && data.site_title.trim())
        ? data.site_title.trim()
        : 'Web-Celebration';
      document.title = siteTitle;
      const bn = $('#brandName'); if (bn) bn.textContent = siteTitle;

      const intro = (typeof data.intro === 'string') ? data.intro : '';
      const introEl = $('#introText'); if (introEl && intro.trim()) introEl.innerHTML = linkify(intro);
      const haveCelebrations = celebrations.length > 0;
      const haveAchievements = achievements.length > 0;

      if (haveCelebrations) renderCalendar(celebrations);

      ALL_ACH = achievements;
      ASSETS_BASE = assetsBase;

      if (haveAchievements) {
        setupTypeChips(ALL_ACH); // builds chips and selection
        renderFiltered();        // renders list + chart using current multi-select
      }

      adaptUI({
        haveCelebrations, haveAchievements,
        tabsContainer, tabCelebrations, tabAchievements,
        viewCelebrations, viewAchievements
      });

    })
    .catch(err => console.error('Error loading YAML:', err));
});

// ===== UI adaptation (all null-safe) =====
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
function externalTooltipHandler(context) {
  const { chart, tooltip } = context;
  let el = chart.canvas.parentNode.querySelector('.chart-tooltip');

  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-tooltip';
    el.style.opacity = '0';
    chart.canvas.parentNode.appendChild(el);
  }

  if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }

  const dp = tooltip.dataPoints && tooltip.dataPoints[0];
  const raw = dp ? dp.raw : null;
  const title = raw?.title || '';
  const descHtml = linkify(raw?.description || '');
  const img = raw ? (FIRST_IMG.get(raw.key) || '') : '';

  el.innerHTML = `
    <div class="ct-head">${escapeHTML(title)}</div>
    <div class="ct-body">
      ${img ? `<img src="${img}" alt="${escapeHTML(title)}">` : `<div></div>`}
      <div class="ct-text">
        ${descHtml || '<em>No description</em>'}
      </div>
    </div>
  `;

  const { canvas } = chart;
  const rect = canvas.getBoundingClientRect();
  const left = rect.left + window.pageXOffset + tooltip.caretX;
  const top  = rect.top  + window.pageYOffset + tooltip.caretY - 12;

  el.style.opacity = '1';
  el.style.left = `${left}px`;
  el.style.top  = `${top}px`;
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

    // 2-digit years supported: 00–69 => 2000+, 70–99 => 1900+
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

// ===== Achievements (auto-gallery by title or explicit images) =====
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
    card.appendChild(header);

    if (a.description) {
      const desc = document.createElement('p');
      desc.classList.add('ach-desc');
      desc.innerHTML = linkify(a.description); // was: textContent
      card.appendChild(desc);
    }
    const gallery = document.createElement('div');
    gallery.classList.add('gallery');
    card.appendChild(gallery);

    if (Array.isArray(a.images) && a.images.length) {
      const resolved = a.images.map(src => resolveImageSrc(src, assetsBase));
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

      // Try JSON manifest first (built at startup)
      fetch(manifestUrl, { cache: 'no-store' })
        .then(res => {
          console.debug('manifest status', manifestUrl, res.status);
          if (!res.ok) throw new Error(`manifest ${res.status}`);
          return res.json();
        })
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
          if (images.length) FIRST_IMG.set(achKey(a), images[0]);
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

// ===== Directory listing fetch & parse (requires Nginx autoindex on /data) =====
async function listImagesInDir(dirUrl) {
  const res = await fetch(dirUrl, { headers: { 'Accept': 'text/html' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a'));
  const files = anchors
    .map(a => a.getAttribute('href') || '')
    .filter(h => h && !h.endsWith('/'))
    .filter(isImageFile);

  return files.map(h => new URL(h, dirUrl).toString());
}
function isImageFile(name) { return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name); }

// ===== Chart (XY or fallback) =====
function renderAchievementsChart(items) {
  const canvas = document.getElementById('achievementsChart');
  const note   = document.getElementById('chartNote');
  if (!canvas) return;

  if (achievementsChart) { achievementsChart.destroy(); achievementsChart = null; }

  // Preload first images for tooltip, then draw
  prefetchFirstImages(items, ASSETS_BASE).finally(() => {
    const points = items.map(a => {
      const d = parseDDMMYYYY(a.date);
      const year = d ? d.getFullYear() : null;
      let y = Number(a.weight);
      if (!Number.isFinite(y) && a.xy && isFinite(+a.xy.y)) y = Number(a.xy.y); // legacy
      if (!Number.isFinite(y) || !year) return null;
      y = Math.max(1, Math.min(5, y));
      return {
        x: year, y,
        title: a.title || '',
        description: a.description || '',
        key: achKey(a)
      };
    }).filter(Boolean);

    const opts = {
      responsive: true, maintainAspectRatio: false, animation: false,
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,          // we render our own
          external: externalTooltipHandler
        }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Year' }, ticks: { stepSize: 1, callback: v => Number(v).toFixed(0) } },
        y: { title: { display: true, text: 'Weight (1–5)' }, min: 0.5, max: 5.5, ticks: { stepSize: 1 } }
      }
    };

    if (points.length) {
      const xs = points.map(p => p.x);
      opts.scales.x.min = Math.min(...xs) - 1;
      opts.scales.x.max = Math.max(...xs) + 1;

      achievementsChart = new Chart(canvas, {
        type: 'scatter',
        data: { datasets: [{ label: 'Achievements', data: points, pointRadius: 5 }] },
        options: opts
      });
      if (note) note.textContent = 'Scatter: Year vs Weight (1–5). Hover points for image + description.';
    } else {
      const byYear = {};
      items.forEach(a => { const d = parseDDMMYYYY(a.date); if (d) byYear[d.getFullYear()] = (byYear[d.getFullYear()] || 0) + 1; });
      const labels = Object.keys(byYear).sort((a,b) => +a - +b);
      const counts = labels.map(y => byYear[y]);

      achievementsChart = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Achievements per Year', data: counts }] },
        options: opts
      });
      if (note) note.textContent = 'No weights found; showing achievements per year.';
    }
  });
}


// ===== Lightbox =====
function openLightbox(images, index = 0) {
  lightboxState.images = images || [];
  lightboxState.index = Math.max(0, Math.min(index, images.length - 1));
  updateLightbox();
  const lb = $('#lightbox');
  if (lb) {
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
}
function closeLightbox() {
  const lb = $('#lightbox');
  if (lb) {
    lb.hidden = true;
    document.body.style.overflow = '';
  }
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
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function linkify(text) {
  if (!text) return '';
  let s = escapeHTML(text);

  // http/https
  s = s.replace(/\bhttps?:\/\/[^\s<)]+/gi, (m) =>
    `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);

  // www.*  (captures leading space or "(" so we can keep it)
  s = s.replace(/(^|[\s(])(www\.[^\s<)]+)/gi, (_full, lead, host) =>
    `${lead}<a href="https://${host}" target="_blank" rel="noopener noreferrer">${host}</a>`);

  // line breaks (optional)
  s = s.replace(/\n/g, '<br>');
  return s;
}

// ===== Utils =====
function formatDate(date) {
  const options = { day: 'numeric', month: 'long' };
  return date.toLocaleDateString(undefined, options);
}
function capitalizeFirstLetter(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
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
function ensureTrailingSlash(p) {
  if (!p) return '/';
  return p.endsWith('/') ? p : p + '/';
}
function resolveImageSrc(src, base) {
  if (!src) return '';
  if (/^([a-z]+:)?\/\//i.test(src) || src.startsWith('/')) return src;
  return ensureTrailingSlash(base) + src.replace(/^\.?\//, '');
}
function slugify(str) {
  return String(str || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
