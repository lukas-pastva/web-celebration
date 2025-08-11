// ===== Config via URL =====
const QS = new URLSearchParams(location.search);
const DEBUG = QS.get('debug') === '1' || QS.get('debug') === 'true';
const PREFETCH_MODE = (QS.get('prefetch') || 'none') // none | hover | all
  .toLowerCase();
const AUTOLOAD_CARDS = QS.get('autoload') === '1' || QS.get('autoload') === 'true';

const D = (...args) => { if (DEBUG) console.log('[WC]', ...args); };

// ===== Icons for celebrations =====
const eventIcons = {
  birthday: 'fa-birthday-cake',
  valentine: 'fa-heart',
  namesday: 'fa-user',
  christmas: 'fa-tree',
  wedding: 'fa-ring',
};

let ALL_ACH = [];
let ALL_ACH_MAP = new Map();   // key -> achievement
let ASSETS_BASE = '';
let CHIPS_TYPES = [];
let HAS_UNTAGGED = false;
let SELECTED_TYPES = new Set();
const FILTER_KEY = 'wc_type_filter_v2';
let FIRST_IMG = new Map();     // key -> first image URL (cached)

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

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  console.time?.('wc_total');

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
  console.time?.('wc_fetch_yaml');
  fetch(`celebrations.yaml?t=${bust}`, { cache: 'no-store' })
    .then(r => r.text())
    .then(yamlText => {
      console.timeEnd?.('wc_fetch_yaml');
      console.time?.('wc_parse_yaml');
      const data = jsyaml.load(yamlText) || {};
      console.timeEnd?.('wc_parse_yaml');

      const celebrations = Array.isArray(data.celebrations) ? data.celebrations : [];
      const achievements = Array.isArray(data.achievements) ? data.achievements : [];

      ASSETS_BASE = ensureTrailingSlash(
        typeof data.assets_base_path === 'string' ? data.assets_base_path : '/data/'
      );

      // Title + intro
      const siteTitle = (typeof data.site_title === 'string' && data.site_title.trim())
        ? data.site_title.trim() : 'Web-Celebration';
      document.title = siteTitle;
      const bn = $('#brandName'); if (bn) bn.textContent = siteTitle;

      const intro = (typeof data.intro === 'string') ? data.intro : '';
      const introEl = $('#introText');
      if (introEl) introEl.innerHTML = intro.trim() ? linkify(intro) : '';

      const haveCelebrations = celebrations.length > 0;
      const haveAchievements = achievements.length > 0;

      if (haveCelebrations) renderCalendar(celebrations);

      ALL_ACH = achievements;
      ALL_ACH_MAP = new Map(ALL_ACH.map(a => [achKey(a), a]));

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
    .catch(err => {
      console.error('Error loading YAML:', err);
    })
    .finally(() => {
      console.timeEnd?.('wc_total');
    });
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

// ===== Filtering (chips) =====
function normTypes(val) {
  let arr = [];
  if (Array.isArray(val)) arr = val;
  else if (typeof val === 'string') arr = val.split(/[,\|]/);
  return arr.map(s => s.trim().toLowerCase()).filter(Boolean);
}
function titlecase(s) {
  return String(s).replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/[-_]/g, ' ');
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
  chipsHost.appendChild(makeChip('__all', 'All'));

  CHIPS_TYPES.forEach(t => chipsHost.appendChild(makeChip(t, titlecase(t))));
  if (HAS_UNTAGGED) chipsHost.appendChild(makeChip('__untagged', 'Untagged'));

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
      SELECTED_TYPES = new Set(['__all']);
    } else {
      SELECTED_TYPES.delete('__all');
      if (SELECTED_TYPES.has(value)) SELECTED_TYPES.delete(value);
      else SELECTED_TYPES.add(value);
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

// ===== Achievements (no network until user asks) =====
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

  const io = AUTOLOAD_CARDS ? new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const target = entry.target;
      const folder = target.getAttribute('data-folder');
      const title = target.getAttribute('data-title');
      const key   = target.getAttribute('data-key');
      autoLoadGalleryInto(target, folder, assetsBase, title, key);
      obs.unobserve(target);
    });
  }, { rootMargin: '0px 0px 200px 0px' }) : null;

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
      desc.innerHTML = linkify(a.description);
      card.appendChild(desc);
    }

    const gallery = document.createElement('div');
    gallery.classList.add('gallery');
    card.appendChild(gallery);

    // If explicit images are provided, render immediately (no probing)
    if (Array.isArray(a.images) && a.images.length) {
      const resolved = a.images.map(src => resolveImageSrc(src, assetsBase));
      buildGallery(gallery, resolved, a.title);
    } else {
      // No images listed: render a nondisruptive placeholder WITHOUT network calls.
      const folder = slugify(a.title || `achievement-${idx + 1}`);
      const key = achKey(a);

      gallery.setAttribute('data-folder', folder);
      gallery.setAttribute('data-title', a.title || '');
      gallery.setAttribute('data-key', key);

      const box = document.createElement('div');
      box.style.color = 'var(--muted)';
      box.style.fontSize = '14px';
      box.style.display = 'flex';
      box.style.alignItems = 'center';
      box.style.gap = '8px';
      box.style.flexWrap = 'wrap';

      const msg = document.createElement('span');
      msg.textContent = 'No images yet.';
      box.appendChild(msg);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Try to load';
      btn.style.border = '0';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '8px';
      btn.style.cursor = 'pointer';
      btn.style.boxShadow = 'var(--shadow)';
      btn.addEventListener('click', () => {
        autoLoadGalleryInto(gallery, folder, assetsBase, a.title || '', key);
      });
      box.appendChild(btn);

      const hint = document.createElement('span');
      hint.style.opacity = '0.8';
      hint.textContent = ` Add images to ${ensureTrailingSlash(assetsBase)}${folder}/ (optional)`;
      box.appendChild(hint);

      gallery.appendChild(box);

      if (io) io.observe(gallery);
    }

    container.appendChild(card);
  });
}

function autoLoadGalleryInto(galleryEl, folder, assetsBase, title, key) {
  if (!galleryEl) return;
  const manifestUrl = `/_gallery/${folder}.json?t=${Date.now()}`;
  const dirUrl      = ensureTrailingSlash(assetsBase) + folder + '/';

  // Show a tiny loader
  const prev = galleryEl.innerHTML;
  galleryEl.innerHTML = '<div class="chart-note">Loading images…</div>';

  // Try JSON manifest, if 404 skip silently; then try autoindex; on failure show friendly message
  fetch(manifestUrl, { cache: 'no-store' })
    .then(res => res.ok ? res.json() : Promise.reject('no-manifest'))
    .then(json => Array.isArray(json.images) ? json.images : [])
    .catch(() => listImagesInDir(dirUrl)) // returns [] (not error) on 404
    .then(images => {
      if (images.length) {
        FIRST_IMG.set(key, images[0]);
        galleryEl.innerHTML = '';
        buildGallery(galleryEl, images, title);
      } else {
        galleryEl.innerHTML = prev; // restore placeholder
      }
    })
    .catch(err => {
      D('Gallery load error', folder, err);
      galleryEl.innerHTML = prev; // restore placeholder
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

// ===== Directory listing fetch & parse (returns [] on 404) =====
async function listImagesInDir(dirUrl) {
  try {
    const res = await fetch(dirUrl, { headers: { 'Accept': 'text/html' }, cache: 'no-store' });
    if (res.status === 404) { D('Autoindex 404 for', dirUrl); return []; }
    if (!res.ok) { D('Autoindex HTTP', res.status, 'for', dirUrl); return []; }
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a'));
    const files = anchors
      .map(a => a.getAttribute('href') || '')
      .filter(h => h && !h.endsWith('/'))
      .filter(isImageFile);
    return files.map(h => new URL(h, dirUrl).toString());
  } catch (e) {
    D('Autoindex error', dirUrl, e);
    return [];
  }
}
function isImageFile(name) { return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name); }

// ===== Chart (hover-only image fetching) =====
function renderAchievementsChart(items) {
  const canvas = document.getElementById('achievementsChart');
  const note   = document.getElementById('chartNote');
  if (!canvas) return;

  if (achievementsChart) { achievementsChart.destroy(); achievementsChart = null; }

  const points = items.map(a => {
    const d = parseDDMMYYYY(a.date);
    if (!d) return null;
    const year = d.getFullYear() + (d.getMonth()/12) + (d.getDate()/365.25); // month/day precision
    let y = Number(a.weight);
    if (!Number.isFinite(y) && a.xy && isFinite(+a.xy.y)) y = Number(a.xy.y); // legacy
    if (!Number.isFinite(y)) return null;
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
      tooltip: { enabled: false, external: externalTooltipHandler }
    },
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Year' },
        ticks: {
          stepSize: 1/12, // month lines
          callback: (v) => {
            const y = Math.floor(v);
            const m = Math.round((v - y) * 12);
            return m === 0 ? String(y) : ''; // show only full years (grid still shows months)
          }
        },
        grid: { drawTicks: false }
      },
      y: { title: { display: true, text: 'Weight (1–5)' }, min: 0.5, max: 5.5, ticks: { stepSize: 1 } }
    }
  };

  if (points.length) {
    const xs = points.map(p => p.x);
    opts.scales.x.min = Math.min(...xs) - 0.1;
    opts.scales.x.max = Math.max(...xs) + 0.1;

    achievementsChart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Achievements',
          data: points,
          pointRadius: 7,              // easier to hit
          pointHoverRadius: 10,
          pointStyle: 'star',          // star-looking point
        }]
      },
      options: opts,
      plugins: [{
        // change cursor on hover
        id: 'cursor',
        afterEvent: (chart, args) => {
          const el = chart.canvas;
          const p = chart.getElementsAtEventForMode(args.event, 'nearest', {intersect: true}, false);
          el.style.cursor = p.length ? 'pointer' : 'default';
        }
      }]
    });

    if (note) note.textContent = 'Scatter: Year (with months) vs Weight (1–5). Hover points for image + description.';
  } else {
    achievementsChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Achievements per Year', data: [] }] },
      options: opts
    });
    if (note) note.textContent = 'No weights found.';
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
  const key = raw?.key || '';

  // If we have an image cached, use it; otherwise leave empty and try to fetch ONCE.
  let img = FIRST_IMG.get(key) || '';
  if (!img && PREFETCH_MODE !== 'none') {
    // Optional: prefetch on hover for this one item
    maybeEnsureFirstImage(raw).then(url => {
      if (url) {
        // If tooltip still refers to same point, update it
        if (el.style.opacity !== '0') {
          const body = el.querySelector('.ct-body');
          if (body) {
            body.innerHTML = `
              <img src="${url}" alt="${escapeHTML(title)}">
              <div class="ct-text">${descHtml || '<em>No description</em>'}</div>
            `;
          }
        }
      }
    });
  }

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

function maybeEnsureFirstImage(raw) {
  const key = raw?.key;
  if (!key) return Promise.resolve(null);
  if (FIRST_IMG.has(key)) return Promise.resolve(FIRST_IMG.get(key) || null);

  const a = ALL_ACH_MAP.get(key);
  if (!a) return Promise.resolve(null);

  return fetchFirstImage(a, ASSETS_BASE).then(u => {
    if (u) FIRST_IMG.set(key, u);
    return u || null;
  });
}

// Try to find the first image for a single achievement (used on hover)
function fetchFirstImage(a, assetsBase) {
  // 1) explicit images
  if (Array.isArray(a.images) && a.images.length) {
    return Promise.resolve(resolveImageSrc(a.images[0], assetsBase));
  }
  // 2) manifest, then autoindex fallback
  const folder = slugify(a.title || 'achievement');
  const manifestUrl = `/_gallery/${folder}.json?t=${Date.now()}`;
  const dirUrl = ensureTrailingSlash(assetsBase) + folder + '/';

  D('fetchFirstImage:', folder);

  // Try manifest; ignore 404; then try autoindex; both return '' if not found.
  return fetch(manifestUrl, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : Promise.reject('no-manifest')))
    .then(j => (Array.isArray(j.images) && j.images.length ? j.images[0] : ''))
    .catch(() => listImagesInDir(dirUrl).then(arr => (arr[0] || '')))
    .catch(() => '');
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

  // www.*
  s = s.replace(/(^|[\s(])(www\.[^\s<)]+)/gi, (_full, lead, host) =>
    `${lead}<a href="https://${host}" target="_blank" rel="noopener noreferrer">${host}</a>`);

  // line breaks
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
function achKey(a) {
  return `${slugify(a.title || '')}_${(a.date || '').trim()}`;
}
