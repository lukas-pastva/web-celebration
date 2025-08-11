// ===== Config via URL =====
const QS = new URLSearchParams(location.search);
const DEBUG = QS.get('debug') === '1' || QS.get('debug') === 'true';
const PREFETCH_MODE = (QS.get('prefetch') || 'none').toLowerCase(); // none | hover | all
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

// ===== Color helpers (stable per type) =====
const GOLD = '#FFD84D'; // star fill
const UNTYPED = '#9ca3af';
const PALETTE = [
  '#e76f51', '#2a9d8f', '#e9c46a', '#f4a261', '#264653',
  '#6a4c93', '#43aa8b', '#577590', '#bc6c25', '#8ab17d',
  '#f28482', '#84a59d', '#3a86ff', '#ff006e', '#8338ec'
];
const TYPE_COLOR = new Map();
function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){ h=((h<<5)-h+str.charCodeAt(i))|0; } return Math.abs(h); }
function colorForType(t){
  if (!t) return UNTYPED;
  const key = String(t).toLowerCase();
  if (!TYPE_COLOR.has(key)) TYPE_COLOR.set(key, PALETTE[hashCode(key)%PALETTE.length]);
  return TYPE_COLOR.get(key);
}
function firstType(val){
  if (!val) return '';
  if (Array.isArray(val)) return (val[0] || '').toString();
  return String(val).split(/[,\|]/)[0].trim();
}

// ===== Global state =====
let ALL_ACH = [];
let ALL_ACH_MAP = new Map();   // key -> achievement
let ASSETS_BASE = '';
let CHIPS_TYPES = [];
let HAS_UNTAGGED = false;
let SELECTED_TYPES = new Set();
const FILTER_KEY = 'wc_type_filter_v2';
let FIRST_IMG = new Map();     // key -> first image URL (cached)

// ===== Theme =====
let lightboxState = { images: [], index: 0 };
let achievementsChart = null;
const THEME_KEY = 'wc_theme';

const $ = (sel) => document.querySelector(sel);
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

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
  const icon = $('#themeToggle i'); const btn  = $('#themeToggle');
  if (!icon || !btn) return;
  icon.classList.remove('fa-sun', 'fa-moon');
  if (theme === 'dark') { icon.classList.add('fa-sun'); btn.setAttribute('aria-label','Switch to light mode'); btn.title='Switch to light mode'; }
  else { icon.classList.add('fa-moon'); btn.setAttribute('aria-label','Switch to dark mode'); btn.title='Switch to dark mode'; }
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  console.time?.('wc_total');
  setTheme(preferredTheme());
  on($('#themeToggle'),'click',()=>setTheme(currentTheme()==='light'?'dark':'light'));
  on(document,'keydown',(e)=>{ if (e.key==='Escape'||e.key==='Esc'){ const lb=$('#lightbox'); if(lb&&!lb.hidden) closeLightbox(); }});

  const tabsContainer=$('.tabs'), tabCelebrations=$('#tab-celebrations'),
        tabAchievements=$('#tab-achievements'), viewCelebrations=$('#view-celebrations'),
        viewAchievements=$('#view-achievements');

  on(tabCelebrations,'click',()=>{ activateTab(tabCelebrations,viewCelebrations); deactivateTab(tabAchievements,viewAchievements); achievementsChart?.resize(); });
  on(tabAchievements,'click',()=>{ activateTab(tabAchievements,viewAchievements); deactivateTab(tabCelebrations,viewCelebrations); achievementsChart?.resize(); });

  on($('#lightboxClose'),'click',closeLightbox);
  on($('#lightboxPrev'),'click',()=>navLightbox(-1));
  on($('#lightboxNext'),'click',()=>navLightbox(1));
  on($('#lightbox'),'click',(e)=>{ if(e.target.id==='lightbox') closeLightbox(); });

  const bust = Date.now();
  console.time?.('wc_fetch_yaml');
  fetch(`celebrations.yaml?t=${bust}`, { cache: 'no-store' })
    .then(r=>r.text())
    .then(yamlText=>{
      console.timeEnd?.('wc_fetch_yaml');
      console.time?.('wc_parse_yaml');
      const data = jsyaml.load(yamlText)||{};
      console.timeEnd?.('wc_parse_yaml');

      const celebrations = Array.isArray(data.celebrations)?data.celebrations:[];
      const achievements = Array.isArray(data.achievements)?data.achievements:[];

      ASSETS_BASE = ensureTrailingSlash(typeof data.assets_base_path==='string'?data.assets_base_path:'/data/');
      const siteTitle = (typeof data.site_title==='string'&&data.site_title.trim())?data.site_title.trim():'Web-Celebration';
      document.title = siteTitle; const bn=$('#brandName'); if(bn) bn.textContent=siteTitle;
      const intro = (typeof data.intro==='string')?data.intro:''; const introEl=$('#introText'); if(introEl) introEl.innerHTML=intro.trim()?linkify(intro):'';

      const haveCelebrations = celebrations.length>0;
      const haveAchievements = achievements.length>0;

      if (haveCelebrations) renderCalendar(celebrations);

      ALL_ACH = achievements;
      ALL_ACH_MAP = new Map(ALL_ACH.map(a=>[achKey(a),a]));

      if (haveAchievements) {
        setupTypeChips(ALL_ACH);
        renderFiltered();
      }

      adaptUI({haveCelebrations,haveAchievements,tabsContainer,tabCelebrations,tabAchievements,viewCelebrations,viewAchievements});
    })
    .catch(err=>console.error('Error loading YAML:',err))
    .finally(()=>console.timeEnd?.('wc_total'));
});

// ===== UI adaptation =====
function adaptUI(ctx) {
  const {haveCelebrations,haveAchievements,tabsContainer,tabCelebrations,tabAchievements,viewCelebrations,viewAchievements}=ctx;
  if (!haveCelebrations){ tabCelebrations?.style && (tabCelebrations.style.display='none'); viewCelebrations?.classList.remove('active'); if(viewCelebrations) viewCelebrations.style.display='none'; }
  if (!haveAchievements){ tabAchievements?.style && (tabAchievements.style.display='none'); viewAchievements?.classList.remove('active'); if(viewAchievements) viewAchievements.style.display='none'; }
  if (!haveCelebrations && !haveAchievements) {
    tabsContainer && (tabsContainer.style.display='none');
    const main=$('.container'); if(main){ const empty=document.createElement('div'); empty.style.margin='24px 0'; empty.style.color='var(--muted)'; empty.textContent='No celebrations or achievements to show.'; main.appendChild(empty); }
    return;
  }
  if (haveCelebrations && !haveAchievements){ activateTab(tabCelebrations,viewCelebrations); tabsContainer && (tabsContainer.style.display='none'); }
  else if (!haveCelebrations && haveAchievements){ activateTab(tabAchievements,viewAchievements); tabsContainer && (tabsContainer.style.display='none'); }
  else if (tabCelebrations && tabAchievements && viewCelebrations && viewAchievements) {
    if(!tabCelebrations.classList.contains('active') && !tabAchievements.classList.contains('active')){
      activateTab(tabCelebrations,viewCelebrations); deactivateTab(tabAchievements,viewAchievements);
    }
  }
}

// ===== Filtering (chips) =====
function normTypes(val){ let arr=[]; if(Array.isArray(val)) arr=val; else if(typeof val==='string') arr=val.split(/[,\|]/); return arr.map(s=>s.trim().toLowerCase()).filter(Boolean); }
function titlecase(s){ return String(s).replace(/\b([a-z])/g,m=>m.toUpperCase()).replace(/[-_]/g,' '); }

function setupTypeChips(items){
  const wrap=$('#typeFilter'), chipsHost=$('#typeChips'); if(!wrap||!chipsHost) return;
  const set=new Set(); HAS_UNTAGGED=false;
  items.forEach(a=>{ const t=normTypes(a.type); if(t.length===0) HAS_UNTAGGED=true; t.forEach(x=>set.add(x)); });
  CHIPS_TYPES = Array.from(set).sort();
  const shouldShow=(CHIPS_TYPES.length>1)||HAS_UNTAGGED;
  if(!shouldShow){ wrap.hidden=true; return; }

  SELECTED_TYPES = restoreChipSelection();

  chipsHost.innerHTML='';
  chipsHost.appendChild(makeChip('__all','All', null));
  CHIPS_TYPES.forEach(t=>chipsHost.appendChild(makeChip(t,titlecase(t), colorForType(t))));
  if (HAS_UNTAGGED) chipsHost.appendChild(makeChip('__untagged','Untagged', UNTYPED));
  updateChipPressedStates(); wrap.hidden=false;
}

function makeChip(value,label,color){
  const btn=document.createElement('button');
  btn.type='button'; btn.className='chip';
  btn.setAttribute('data-value', value);
  btn.setAttribute('aria-pressed', SELECTED_TYPES.has(value)?'true':'false');
  if (color) btn.style.setProperty('--chip-color', color);
  btn.textContent=label;

  btn.addEventListener('click', ()=>{
    if(value==='__all'){ SELECTED_TYPES=new Set(['__all']); }
    else{
      SELECTED_TYPES.delete('__all');
      SELECTED_TYPES.has(value)?SELECTED_TYPES.delete(value):SELECTED_TYPES.add(value);
      if(SELECTED_TYPES.size===0) SELECTED_TYPES.add('__all');
    }
    persistChipSelection(); updateChipPressedStates(); renderFiltered();
  });
  return btn;
}
function updateChipPressedStates(){ const chipsHost=$('#typeChips'); if(!chipsHost) return; chipsHost.querySelectorAll('.chip').forEach(chip=>{ const v=chip.getAttribute('data-value'); chip.setAttribute('aria-pressed', SELECTED_TYPES.has(v)?'true':'false'); }); }
function persistChipSelection(){ localStorage.setItem(FILTER_KEY, JSON.stringify(SELECTED_TYPES.has('__all')?['__all']:Array.from(SELECTED_TYPES))); }
function restoreChipSelection(){ try{ const raw=localStorage.getItem(FILTER_KEY); if(!raw) return new Set(['__all']); const arr=JSON.parse(raw); if(Array.isArray(arr)&&arr.length) return new Set(arr);}catch{} return new Set(['__all']); }
function getFilteredAchievements(){
  if (SELECTED_TYPES.has('__all')) return ALL_ACH;
  return ALL_ACH.filter(a=>{
    const tags=normTypes(a.type);
    const matchTagged=tags.some(t=>SELECTED_TYPES.has(t));
    const matchUntagged=(tags.length===0 && SELECTED_TYPES.has('__untagged'));
    return matchTagged || matchUntagged;
  });
}
function renderFiltered(){ const items=getFilteredAchievements(); renderAchievements(items,ASSETS_BASE); renderAchievementsChart(items); }

// ===== Tabs helpers =====
function activateTab(tabBtn, viewEl){ if(!tabBtn||!viewEl) return; tabBtn.classList.add('active'); tabBtn.setAttribute('aria-selected','true'); viewEl.classList.add('active'); viewEl.style.display='block'; }
function deactivateTab(tabBtn, viewEl){ if(!tabBtn||!viewEl) return; tabBtn.classList.remove('active'); tabBtn.setAttribute('aria-selected','false'); viewEl.classList.remove('active'); viewEl.style.display='none'; }

// ===== Celebrations (now tinted per type) =====
function renderCalendar(events){
  const calendar=$('#calendar'); if(!calendar) return; calendar.innerHTML='';
  const today=new Date(); const currentYear=today.getFullYear();

  const processed = events.map(event=>{
    let [day,month,year]=String(event.date||'').split('.');
    const dd=parseInt(day,10); const mm=parseInt(month,10)-1; let yy=parseInt(year,10);
    if(!Number.isFinite(yy)) yy=currentYear; else if(year&&year.length===2) yy=yy<=69?2000+yy:1900+yy;
    let eventDate=new Date(currentYear,mm,dd);
    if(isNaN(eventDate.getTime())) eventDate=new Date(currentYear,0,1);
    else if(eventDate<today) eventDate.setFullYear(currentYear+1);
    return {...event,eventDate};
  }).sort((a,b)=>a.eventDate-b.eventDate);

  processed.forEach((event,index)=>{
    const col = colorForType(event.type || 'event');

    const eventDiv=document.createElement('div');
    eventDiv.classList.add('event', index%2===0?'left':'right');

    const contentDiv=document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.style.borderLeft = `6px solid ${col}`;

    const icon=document.createElement('i');
    icon.classList.add('fa-solid', eventIcons[event.type]||'fa-star','icon');
    icon.style.color = col;
    contentDiv.appendChild(icon);

    const title=document.createElement('div');
    title.classList.add('title');
    title.textContent = capitalizeFirstLetter(event.type || 'event'); // show type
    contentDiv.appendChild(title);

    const name=document.createElement('div');
    name.classList.add('name'); name.textContent=event.name||''; contentDiv.appendChild(name);

    const date=document.createElement('div');
    date.classList.add('date'); date.textContent=formatDate(event.eventDate); contentDiv.appendChild(date);

    eventDiv.appendChild(contentDiv); calendar.appendChild(eventDiv);
  });
}

// ===== Achievements (lazy galleries; no errors if missing) =====
function renderAchievements(items, assetsBase){
  const container=$('#achievementsList'); if(!container) return; container.innerHTML='';
  if(!items.length){ const empty=document.createElement('div'); empty.style.color='var(--muted)'; empty.style.fontSize='14px'; empty.textContent='No achievements match this filter.'; container.appendChild(empty); return; }

  const parsed = items.map(a=>({...a, parsedDate: parseDDMMYYYY(a.date)}))
                      .sort((a,b)=>(b.parsedDate?.getTime()||0)-(a.parsedDate?.getTime()||0));

  const io = AUTOLOAD_CARDS ? new IntersectionObserver((entries,obs)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      const target=entry.target;
      autoLoadGalleryInto(target, target.getAttribute('data-folder'), assetsBase, target.getAttribute('data-title'), target.getAttribute('data-key'));
      obs.unobserve(target);
    });
  },{rootMargin:'0px 0px 200px 0px'}) : null;

  parsed.forEach((a,idx)=>{
    const card=document.createElement('article'); card.classList.add('ach-card');

    const header=document.createElement('div'); header.classList.add('ach-header');

    const h3=document.createElement('h3'); h3.textContent=a.title||`Achievement #${idx+1}`; header.appendChild(h3);

    const meta=document.createElement('div'); meta.classList.add('ach-meta');
    meta.innerHTML=`<i class="fa-regular fa-calendar"></i><span>${a.parsedDate?a.parsedDate.toLocaleDateString():(a.date||'')}</span>`;
    header.appendChild(meta);
    card.appendChild(header);

    if(a.description){ const desc=document.createElement('p'); desc.classList.add('ach-desc'); desc.innerHTML=linkify(a.description); card.appendChild(desc); }

    const gallery=document.createElement('div'); gallery.classList.add('gallery'); card.appendChild(gallery);

    if(Array.isArray(a.images)&&a.images.length){
      const resolved=a.images.map(src=>resolveImageSrc(src, assetsBase));
      buildGallery(gallery, resolved, a.title);
    } else {
      const folder=slugify(a.title||`achievement-${idx+1}`); const key=achKey(a);
      gallery.setAttribute('data-folder', folder); gallery.setAttribute('data-title', a.title||''); gallery.setAttribute('data-key', key);

      const box=document.createElement('div');
      box.style.color='var(--muted)'; box.style.fontSize='14px'; box.style.display='flex'; box.style.alignItems='center'; box.style.gap='8px'; box.style.flexWrap='wrap';

      const msg=document.createElement('span'); msg.textContent='No images yet.'; box.appendChild(msg);

      const btn=document.createElement('button'); btn.type='button'; btn.textContent='Try to load';
      btn.style.border='0'; btn.style.padding='6px 10px'; btn.style.borderRadius='8px'; btn.style.cursor='pointer'; btn.style.boxShadow='var(--shadow)';
      btn.addEventListener('click',()=>autoLoadGalleryInto(gallery, folder, ASSETS_BASE, a.title||'', key));
      box.appendChild(btn);

      const hint=document.createElement('span'); hint.style.opacity='0.8'; hint.textContent=` Add images to ${ensureTrailingSlash(assetsBase)}${folder}/ (optional)`; box.appendChild(hint);

      gallery.appendChild(box);
      if (io) io.observe(gallery);
    }

    container.appendChild(card);
  });
}

function autoLoadGalleryInto(galleryEl, folder, assetsBase, title, key){
  if(!galleryEl) return;
  const manifestUrl=`/_gallery/${folder}.json?t=${Date.now()}`;
  const dirUrl=ensureTrailingSlash(assetsBase)+folder+'/';
  const prev=galleryEl.innerHTML;
  galleryEl.innerHTML='<div class="chart-note">Loading images…</div>';

  fetch(manifestUrl,{cache:'no-store'})
    .then(res=>res.ok?res.json():Promise.reject('no-manifest'))
    .then(json=>Array.isArray(json.images)?json.images:[])
    .catch(()=>listImagesInDir(dirUrl))
    .then(images=>{
      if(images.length){
        FIRST_IMG.set(key, images[0]);
        galleryEl.innerHTML=''; buildGallery(galleryEl, images, title);
      } else { galleryEl.innerHTML=prev; }
    })
    .catch(err=>{ D('Gallery load error', folder, err); galleryEl.innerHTML=prev; });
}

function buildGallery(container, imageUrls, title='Achievement'){
  const resolvedImages=imageUrls.slice();
  resolvedImages.forEach((src,i)=>{
    const btn=document.createElement('button'); btn.classList.add('thumb'); btn.setAttribute('aria-label',`Open image ${i+1} for ${title}`);
    const img=document.createElement('img'); img.loading='lazy'; img.decoding='async'; img.src=src; img.alt=`${title} image ${i+1}`;
    btn.appendChild(img); btn.addEventListener('click',()=>openLightbox(resolvedImages,i)); container.appendChild(btn);
  });
}

// ===== Directory listing (404 -> []) =====
async function listImagesInDir(dirUrl){
  try{
    const res=await fetch(dirUrl,{headers:{'Accept':'text/html'}, cache:'no-store'});
    if(res.status===404) { D('Autoindex 404',dirUrl); return []; }
    if(!res.ok) { D('Autoindex HTTP',res.status,dirUrl); return []; }
    const html=await res.text();
    const doc=new DOMParser().parseFromString(html,'text/html');
    const files=Array.from(doc.querySelectorAll('a'))
      .map(a=>a.getAttribute('href')||'')
      .filter(h=>h && !h.endsWith('/'))
      .filter(isImageFile);
    return files.map(h=>new URL(h,dirUrl).toString());
  }catch(e){ D('Autoindex error',dirUrl,e); return []; }
}
function isImageFile(name){ return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name); }

// ===== Chart (colored borders by type, yellow star fill) =====
function renderAchievementsChart(items){
  const canvas=$('#achievementsChart'); const note=$('#chartNote'); if(!canvas) return;
  if (achievementsChart){ achievementsChart.destroy(); achievementsChart=null; }

  const points = items.map(a=>{
    const d=parseDDMMYYYY(a.date); if(!d) return null;
    const year = d.getFullYear() + (d.getMonth()/12) + (d.getDate()/365.25);
    let y=Number(a.weight); if(!Number.isFinite(y) && a.xy && isFinite(+a.xy.y)) y=Number(a.xy.y);
    if(!Number.isFinite(y)) return null; y=Math.max(1,Math.min(5,y));
    const tKey = firstType(a.type);
    return { x:year, y, title:a.title||'', description:a.description||'', key:achKey(a), tKey };
  }).filter(Boolean);

  const opts={
    responsive:true, maintainAspectRatio:false, animation:false,
    devicePixelRatio:Math.min(window.devicePixelRatio||1,2),
    interaction:{mode:'nearest', intersect:true},
    plugins:{
      legend:{display:false},
      tooltip:{enabled:false, external:externalTooltipHandler}
    },
    scales:{
      x:{
        type:'linear', title:{display:true, text:'Year'},
        ticks:{ stepSize:1/12, callback:(v)=>{ const y=Math.floor(v); const m=Math.round((v-y)*12); return m===0?String(y):''; } },
        grid:{ drawTicks:false }
      },
      y:{ title:{display:true, text:'Weight (1–5)'}, min:0.5, max:5.5, ticks:{ stepSize:1 } }
    }
  };

  if (points.length){
    const xs=points.map(p=>p.x); opts.scales.x.min=Math.min(...xs)-0.1; opts.scales.x.max=Math.max(...xs)+0.1;
    const borderColors = points.map(p=>colorForType(p.tKey));
    const bgColors = points.map(()=>GOLD);

    achievementsChart=new Chart(canvas,{
      type:'scatter',
      data:{ datasets:[{
        label:'Achievements',
        data:points,
        pointStyle:'star',
        pointRadius:8,
        pointHoverRadius:11,
        pointBackgroundColor:bgColors,
        pointBorderColor:borderColors,
        pointBorderWidth:2
      }]},
      options:opts,
      plugins:[{
        id:'cursor',
        afterEvent:(chart,args)=>{
          const el=chart.canvas;
          const p=chart.getElementsAtEventForMode(args.event,'nearest',{intersect:true},false);
          el.style.cursor=p.length?'pointer':'default';
        }
      }]
    });
    if (note) note.textContent='Scatter: Year (with months) vs Weight (1–5).';
  } else {
    achievementsChart=new Chart(canvas,{ type:'bar', data:{labels:[],datasets:[{label:'Achievements per Year',data:[]}]}, options:opts });
    if (note) note.textContent='No weights found.';
  }
}

function externalTooltipHandler(context) {
  const { chart, tooltip } = context;

  // Use a single global tooltip, attached to <body>, with the id CSS expects
  let el = document.getElementById('chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chart-tooltip';
    el.className = 'chart-tooltip';
    el.style.opacity = '0';
    document.body.appendChild(el);
  }

  if (tooltip.opacity === 0) {
    el.style.opacity = '0';
    return;
  }

  const dp = tooltip.dataPoints && tooltip.dataPoints[0];
  const raw = dp ? dp.raw : null;
  const title = raw?.title || '';
  const descHtml = linkify(raw?.description || '');
  const key = raw?.key || '';
  const img = FIRST_IMG.get(key) || '';

  el.innerHTML = `
    <button class="ct-close" aria-label="Close">×</button>
    <div class="ct-head">${escapeHTML(title)}</div>
    <div class="ct-body">
      ${img ? `<img class="ct-img" src="${img}" alt="${escapeHTML(title)}">` : `<div></div>`}
      <div class="ct-text">${descHtml || '<em>No description</em>'}</div>
    </div>
  `;

  // Position for a FIXED element (viewport coords — no page offsets)
  const rect = chart.canvas.getBoundingClientRect();
  const left = rect.left + tooltip.caretX;
  const top  = rect.top  + tooltip.caretY - 12;

  el.style.opacity = '1';
  el.style.left = `${left}px`;
  el.style.top  = `${top}px`;
}

function maybeEnsureFirstImage(raw){
  const key=raw?.key; if(!key) return Promise.resolve(null);
  if(FIRST_IMG.has(key)) return Promise.resolve(FIRST_IMG.get(key)||null);
  const a=ALL_ACH_MAP.get(key); if(!a) return Promise.resolve(null);
  return fetchFirstImage(a,ASSETS_BASE).then(u=>{ if(u) FIRST_IMG.set(key,u); return u||null; });
}
function fetchFirstImage(a, assetsBase){
  if(Array.isArray(a.images)&&a.images.length) return Promise.resolve(resolveImageSrc(a.images[0], assetsBase));
  const folder=slugify(a.title||'achievement'); const manifestUrl=`/_gallery/${folder}.json?t=${Date.now()}`; const dirUrl=ensureTrailingSlash(assetsBase)+folder+'/';
  D('fetchFirstImage:', folder);
  return fetch(manifestUrl,{cache:'no-store'})
    .then(r=>r.ok?r.json():Promise.reject('no-manifest'))
    .then(j=>(Array.isArray(j.images)&&j.images.length?j.images[0]:'')) // '' if none
    .catch(()=>listImagesInDir(dirUrl).then(arr=>arr[0]||''))
    .catch(()=> '');
}

// ===== Lightbox =====
function openLightbox(images,index=0){ lightboxState.images=images||[]; lightboxState.index=Math.max(0,Math.min(index,images.length-1)); updateLightbox(); const lb=$('#lightbox'); if(lb){ lb.hidden=false; document.body.style.overflow='hidden'; } }
function closeLightbox(){ const lb=$('#lightbox'); if(lb){ lb.hidden=true; document.body.style.overflow=''; } }
function navLightbox(delta){ if(!lightboxState.images.length) return; lightboxState.index=(lightboxState.index+delta+lightboxState.images.length)%lightboxState.images.length; updateLightbox(); }
function updateLightbox(){ const img=$('#lightboxImg'); if(img) img.src=lightboxState.images[lightboxState.index]; }

// ===== Linkify =====
function escapeHTML(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function linkify(text){
  if(!text) return '';
  let s=escapeHTML(text);
  s=s.replace(/\bhttps?:\/\/[^\s<)]+/gi,(m)=>`<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
  s=s.replace(/(^|[\s(])(www\.[^\s<)]+)/gi,(_f,lead,host)=>`${lead}<a href="https://${host}" target="_blank" rel="noopener noreferrer">${host}</a>`);
  s=s.replace(/\n/g,'<br>');
  return s;
}

// ===== Utils =====
function formatDate(date){ const options={day:'numeric',month:'long'}; return date.toLocaleDateString(undefined,options); }
function capitalizeFirstLetter(str){ if(!str||typeof str!=='string') return ''; return str.charAt(0).toUpperCase()+str.slice(1); }
function parseDDMMYYYY(s){
  if(!s||typeof s!=='string') return null;
  const parts=s.split('.'); if(parts.length<2) return null;
  const day=parseInt(parts[0],10); const month=parseInt(parts[1],10)-1;
  let year=parts[2]?parts[2].trim():''; let yy=parseInt(year,10);
  if(!Number.isFinite(yy)) yy=new Date().getFullYear(); else if(year.length===2) yy=yy<=69?2000+yy:1900+yy;
  const d=new Date(yy,month,day); return isNaN(d.getTime())?null:d;
}
function ensureTrailingSlash(p){ if(!p) return '/'; return p.endsWith('/')?p:p+'/'; }
function resolveImageSrc(src,base){ if(!src) return ''; if(/^([a-z]+:)?\/\//i.test(src)||src.startsWith('/')) return src; return ensureTrailingSlash(base)+src.replace(/^\.?\//,''); }
function slugify(str){ return String(str||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function achKey(a){ return `${slugify(a.title||'')}_${(a.date||'').trim()}`; }
