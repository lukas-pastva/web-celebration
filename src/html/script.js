// ===== Icons for celebrations =====
const eventIcons = {
  birthday: 'fa-birthday-cake',
  valentine: 'fa-heart',
  namesday: 'fa-user',
  christmas: 'fa-tree',
  wedding: 'fa-ring',
};

// ===== State for lightbox =====
let lightboxState = { images: [], index: 0 };

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  // Tabs
  const tabCelebrations = document.getElementById('tab-celebrations');
  const tabAchievements = document.getElementById('tab-achievements');
  const viewCelebrations = document.getElementById('view-celebrations');
  const viewAchievements = document.getElementById('view-achievements');

  tabCelebrations.addEventListener('click', () => {
    activateTab(tabCelebrations, viewCelebrations);
    deactivateTab(tabAchievements, viewAchievements);
  });
  tabAchievements.addEventListener('click', () => {
    activateTab(tabAchievements, viewAchievements);
    deactivateTab(tabCelebrations, viewCelebrations);
  });

  // Theme switching
  const themeSelect = document.getElementById('themeSelect');
  themeSelect.addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
  });

  // Lightbox
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev').addEventListener('click', () => navLightbox(-1));
  document.getElementById('lightboxNext').addEventListener('click', () => navLightbox(1));
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });

  // Load data
  fetch('celebrations.yaml')
    .then(r => r.text())
    .then(yamlText => {
      const data = jsyaml.load(yamlText) || {};
      const celebrations = Array.isArray(data.celebrations) ? data.celebrations : [];
      const achievements = Array.isArray(data.achievements) ? data.achievements : [];

      // Determine base path for local images
      const assetsBase = ensureTrailingSlash(typeof data.assets_base_path === 'string' ? data.assets_base_path : '/data/');

      renderCalendar(celebrations);
      renderAchievements(achievements, assetsBase);
      renderAchievementsChart(achievements);
    })
    .catch(err => console.error('Error loading YAML:', err));
});

// ===== Tabs helpers =====
function activateTab(tabBtn, viewEl) {
  tabBtn.classList.add('active');
  tabBtn.setAttribute('aria-selected', 'true');
  viewEl.classList.add('active');
}
function deactivateTab(tabBtn, viewEl) {
  tabBtn.classList.remove('active');
  tabBtn.setAttribute('aria-selected', 'false');
  viewEl.classList.remove('active');
}

// ===== Celebrations (existing) =====
function renderCalendar(events) {
  const calendar = document.getElementById('calendar');
  calendar.innerHTML = '';

  const today = new Date();
  const currentYear = today.getFullYear();

  const processed = events.map(event => {
    let [day, month] = String(event.date || '').split('.');
    day = parseInt(day);
    month = parseInt(month) - 1;
    let eventDate = new Date(currentYear, month, day);
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

// ===== Achievements (top-down + gallery) =====
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

    // Gallery
    if (Array.isArray(a.images) && a.images.length) {
      const gallery = document.createElement('div');
      gallery.classList.add('gallery');

      // Pre-resolve all images for lightbox
      const resolvedImages = a.images.map(src => resolveImageSrc(src, assetsBase));

      resolvedImages.forEach((src, i) => {
        const btn = document.createElement('button');
        btn.classList.add('thumb');
        btn.setAttribute('aria-label', `Open image ${i + 1} for ${a.title || 'achievement'}`);

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = src;
        img.alt = `${a.title || 'Achievement'} image ${i + 1}`;

        btn.appendChild(img);
        btn.addEventListener('click', () => openLightbox(resolvedImages, i));
        gallery.appendChild(btn);
      });

      card.appendChild(gallery);
    }

    container.appendChild(card);
  });
}

// ===== Chart (XY or fallback) =====
function renderAchievementsChart(items) {
  const canvas = document.getElementById('achievementsChart');
  const note   = document.getElementById('chartNote');

  const xyPoints = items
    .filter(a => a.xy && isFinite(+a.xy.x) && isFinite(+a.xy.y))
    .map(a => ({ x: Number(a.xy.x), y: Number(a.xy.y), title: a.title || '' }));

  if (xyPoints.length) {
    new Chart(canvas, {
      type: 'scatter',
      data: { datasets: [{ label: 'Achievements', data: xyPoints, pointRadius: 5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: (ctx) => {
            const d = ctx.raw; return `${d.title ? d.title + ' — ' : ''}x: ${d.x}, y: ${d.y}`;
          }}},
          legend: { display: false }
        },
        scales: { x: { title: { display: true, text: 'X' } }, y: { title: { display: true, text: 'Y' } } }
      }
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

    new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Achievements per Year', data: counts }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { title: { display: true, text: 'Year' } }, y: { title: { display: true, text: 'Count' }, beginAtZero: true } }
      }
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
  const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}
function ensureTrailingSlash(p) {
  if (!p) return '/';
  return p.endsWith('/') ? p : p + '/';
}
function resolveImageSrc(src, base) {
  if (!src) return '';
  // Absolute URL or absolute path
  if (/^([a-z]+:)?\/\//i.test(src) || src.startsWith('/')) return src;
  // Relative -> prefix base (/data/ by default)
  return ensureTrailingSlash(base) + src.replace(/^\.?\//, '');
}
