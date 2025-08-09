// ===== Icons for celebrations =====
const eventIcons = {
  birthday: 'fa-birthday-cake',
  valentine: 'fa-heart',
  namesday: 'fa-user',
  christmas: 'fa-tree',
  wedding: 'fa-ring',
};

// ===== State =====
let lightboxState = { images: [], index: 0 };
let achievementsChart = null; // prevent duplicate charts

document.addEventListener('DOMContentLoaded', () => {
  // Tabs & views
  const tabsContainer     = document.querySelector('.tabs');
  const tabCelebrations   = document.getElementById('tab-celebrations');
  const tabAchievements   = document.getElementById('tab-achievements');
  const viewCelebrations  = document.getElementById('view-celebrations');
  const viewAchievements  = document.getElementById('view-achievements');

  tabCelebrations.addEventListener('click', () => {
    activateTab(tabCelebrations, viewCelebrations);
    deactivateTab(tabAchievements, viewAchievements);
    // Optional: if chart was initialized while hidden, resize on show
    if (achievementsChart) achievementsChart.resize();
  });
  tabAchievements.addEventListener('click', () => {
    activateTab(tabAchievements, viewAchievements);
    deactivateTab(tabCelebrations, viewCelebrations);
    if (achievementsChart) achievementsChart.resize();
  });

  // Theme
  const themeSelect = document.getElementById('themeSelect');
  themeSelect.addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
    if (achievementsChart) achievementsChart.resize();
  });

  // Lightbox
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev').addEventListener('click', () => navLightbox(-1));
  document.getElementById('lightboxNext').addEventListener('click', () => navLightbox(1));
  document.getElementById('lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });

  // Load data (cache-busted) & render
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

      const haveCelebrations = celebrations.length > 0;
      const haveAchievements = achievements.length > 0;

      if (haveCelebrations) renderCalendar(celebrations);
      if (haveAchievements) {
        renderAchievements(achievements, assetsBase);
        renderAchievementsChart(achievements);
      }

      adaptUI({
        haveCelebrations, haveAchievements,
        tabsContainer, tabCelebrations, tabAchievements,
        viewCelebrations, viewAchievements,
        themeSelect
      });
    })
    .catch(err => console.error('Error loading YAML:', err));
});

// ===== UI adaptation =====
function adaptUI(ctx) {
  const {
    haveCelebrations, haveAchievements,
    tabsContainer, tabCelebrations, tabAchievements,
    viewCelebrations, viewAchievements,
    themeSelect
  } = ctx;

  if (!haveCelebrations) {
    tabCelebrations.style.display = 'none';
    viewCelebrations.classList.remove('active');
    viewCelebrations.style.display = 'none';
  }
  if (!haveAchievements) {
    tabAchievements.style.display = 'none';
    viewAchievements.classList.remove('active');
    viewAchievements.style.display = 'none';
  }

  if (!haveCelebrations && !haveAchievements) {
    if (tabsContainer) tabsContainer.style.display = 'none';
    const main = document.querySelector('.container');
    const empty = document.createElement('div');
    empty.style.margin = '24px 0';
    empty.style.color = 'var(--muted)';
    empty.textContent = 'No celebrations or achievements to show.';
    main.appendChild(empty);
    return;
  }

  if (haveCelebrations && !haveAchievements) {
    activateTab(tabCelebrations, viewCelebrations);
    if (tabsContainer) tabsContainer.style.display = 'none';
    document.documentElement.setAttribute('data-theme', 'celebrations');
    if (themeSelect) themeSelect.value = 'celebrations';
  } else if (!haveCelebrations && haveAchievements) {
    activateTab(tabAchievements, viewAchievements);
    if (tabsContainer) tabsContainer.style.display = 'none';
    document.documentElement.setAttribute('data-theme', 'achievements');
    if (themeSelect) themeSelect.value = 'achievements';
  } else {
    if (!tabCelebrations.classList.contains('active') &&
        !tabAchievements.classList.contains('active')) {
      activateTab(tabCelebrations, viewCelebrations);
      deactivateTab(tabAchievements, viewAchievements);
    }
  }
}

// ===== Tabs helpers =====
function activateTab(tabBtn, viewEl) {
  tabBtn.classList.add('active');
  tabBtn.setAttribute('aria-selected', 'true');
  viewEl.classList.add('active');
  viewEl.style.display = 'block';
}
function deactivateTab(tabBtn, viewEl) {
  tabBtn.classList.remove('active');
  tabBtn.setAttribute('aria-selected', 'false');
  viewEl.classList.remove('active');
  viewEl.style.display = 'none';
}

// ===== Celebrations =====
function renderCalendar(events) {
  const calendar = document.getElementById('calendar');
  calendar.innerHTML = '';

  const today = new Date();
  const currentYear = today.getFullYear();

  const processed = events.map(event => {
    let [day, month, year] = String(event.date || '').split('.');
    const dd = parseInt(day, 10);
    const mm = parseInt(month, 10) - 1;
    let yy = parseInt(year, 10);

    // If year missing, use current; if 2-digit year, pivot (00–69 => 2000+, 70–99 => 1900+)
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
  const container = document.getElementById('achievementsList');
  container.innerHTML = '';

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
      desc.textContent = a.description;
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
      const dirUrl = ensureTrailingSlash(assetsBase) + folder + '/';

      const placeholder = document.createElement('div');
      placeholder.textContent = 'Loading images…';
      placeholder.style.color = 'var(--muted)';
      placeholder.style.fontSize = '14px';
      gallery.appendChild(placeholder);

      listImagesInDir(dirUrl)
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
          buildGallery(gallery, images, a.title);
        })
        .catch(() => {
          gallery.innerHTML = '';
          const err = document.createElement('div');
          err.textContent = 'Could not load images.';
          err.style.color = 'var(--muted)';
          err.style.fontSize = '14px';
          gallery.appendChild(err);
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

  // Hard-lock canvas height to avoid reflow loops
  canvas.style.height = '280px';

  // Destroy existing chart if present
  if (achievementsChart) {
    achievementsChart.destroy();
    achievementsChart = null;
  }

  const xyPoints = items
    .filter(a => a.xy && isFinite(+a.xy.x) && isFinite(+a.xy.y))
    .map(a => ({ x: Number(a.xy.x), y: Number(a.xy.y), title: a.title || '' }));

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,             // reduce CPU
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const d = ctx.raw;
            return `${d.title ? d.title + ' — ' : ''}x: ${d.x}, y: ${d.y}`;
          }
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'X' } },
      y: { title: { display: true, text: 'Y' } }
    }
  };

  if (xyPoints.length) {
    achievementsChart = new Chart(canvas, {
      type: 'scatter',
      data: { datasets: [{ label: 'Achievements', data: xyPoints, pointRadius: 5 }] },
      options: opts
    });
    note.textContent = 'Showing XY scatter from achievement data.';
  } else {
    const byYear = {};
    items.forEach(a => {
      const d = parseDDMMYYYY(a.date); if (!d) return;
      const y = d.getFullYear(); byYear[y] = (byYear[y] || 0) + 1;
    });
    const labels = Object.keys(byYear).sort((a,b) => +a - +b);
    const counts = labels.map(y => byYear[y]);

    achievementsChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Achievements per Year', data: counts }] },
      options: opts
    });
    note.textContent = 'No XY data found; showing achievements per year.';
  }
}

// ===== Lightbox =====
function openLightbox(images, index = 0) {
  lightboxState.images = images || [];
  lightboxState.index = Math.max(0, Math.min(index, images.length - 1));
  updateLightbox();
  const lb = document.getElementById('lightbox');
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').hidden = true;
  document.body.style.overflow = '';
}
function navLightbox(delta) {
  if (!lightboxState.images.length) return;
  lightboxState.index = (lightboxState.index + delta + lightboxState.images.length) % lightboxState.images.length;
  updateLightbox();
}
function updateLightbox() {
  const img = document.getElementById('lightboxImg');
  img.src = lightboxState.images[lightboxState.index];
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
  else if (year.length === 2) yy = yy <= 69 ? 2000 + yy : 1900 + yy; // 2-digit pivot

  const d = new Date(yy, month, day);
  return isNaN(d.getTime()) ? null : d;
}
function ensureTrailingSlash(p) { return p && p.endsWith('/') ? p : (p || '/') + (p?.endsWith('/') ? '' : '/'); }
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
