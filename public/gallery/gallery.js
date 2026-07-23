// public/gallery/gallery.js
// Vanilla ES module — no build step required.
// Exports renderYearPicker and renderGrid for unit testing.

// ── Render helpers (exported for testing) ──────────────────────────────

/**
 * Render year-picker buttons into `container`.
 * @param {number[]} years
 * @param {number} activeYear
 * @param {HTMLElement} container
 * @param {(year: number) => void} onSelect
 */
export function renderYearPicker(years, activeYear, container, onSelect) {
  container.innerHTML = '';
  years.forEach(year => {
    const btn = document.createElement('button');
    btn.textContent = String(year);
    btn.className = 'year-btn' + (year === activeYear ? ' active' : '');
    btn.addEventListener('click', () => onSelect(year));
    container.appendChild(btn);
  });
}

/**
 * Render photo grid into `container`.
 * @param {{id:number,url:string,caption:string|null,width:number,height:number}[]} photos
 * @param {HTMLElement} container
 * @param {(photo: object) => void} onPhotoClick
 */
export function renderGrid(photos, container, onPhotoClick) {
  container.innerHTML = '';
  if (photos.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-photos';
    msg.textContent = 'No photos for this year yet.';
    container.appendChild(msg);
    return;
  }
  photos.forEach(photo => {
    const fig = document.createElement('figure');
    fig.className = 'photo-item';
    fig.addEventListener('click', () => onPhotoClick(photo));

    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.caption ?? '';
    img.loading = 'lazy';
    img.decoding = 'async';
    // Aspect-ratio hint prevents layout shift
    if (photo.width && photo.height) {
      img.style.aspectRatio = `${photo.width}/${photo.height}`;
    }

    if (photo.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = photo.caption;
      fig.appendChild(img);
      fig.appendChild(cap);
    } else {
      fig.appendChild(img);
    }

    container.appendChild(fig);
  });
}

// ── Lightbox ────────────────────────────────────────────────────────────

/** @param {{url:string,caption:string|null}} photo */
function openLightbox(photo) {
  let overlay = document.getElementById('gallery-lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gallery-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Photo viewer');
    overlay.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-content">
        <button class="lb-close" aria-label="Close">&times;</button>
        <img class="lb-img" src="" alt="" />
        <p class="lb-caption"></p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.lb-backdrop').addEventListener('click', closeLightbox);
    overlay.querySelector('.lb-close').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
  }
  overlay.querySelector('.lb-img').src = photo.url;
  overlay.querySelector('.lb-img').alt = photo.caption ?? '';
  overlay.querySelector('.lb-caption').textContent = photo.caption ?? '';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const overlay = document.getElementById('gallery-lightbox');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── App bootstrap ───────────────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const program = params.get('program');
  if (!program || !['mens', 'women'].includes(program)) {
    document.getElementById('gallery-root').innerHTML =
      '<p class="error">Please specify a program: <a href="?program=mens">Men\'s</a> · <a href="?program=women">Women\'s</a></p>';
    return;
  }

  // Apply program theme class
  document.documentElement.dataset.program = program;
  document.getElementById('gallery-title').textContent =
    program === 'mens' ? "Men's Encounter — Photo Gallery" : "Women's Encounter — Photo Gallery";

  const yearPicker = document.getElementById('year-picker');
  const photoGrid = document.getElementById('photo-grid');
  const loadingEl = document.getElementById('gallery-loading');

  // Fetch available years
  const yearsRes = await fetch(`/api/public/gallery/years?program=${program}`);
  const yearsData = await yearsRes.json();
  const years = yearsData.years ?? [];

  if (years.length === 0) {
    loadingEl.hidden = true;
    photoGrid.innerHTML = '<p class="no-photos">No gallery photos available yet.</p>';
    return;
  }

  // Default to most recent year (or URL param)
  let activeYear = parseInt(params.get('year') ?? '', 10);
  if (!years.includes(activeYear)) activeYear = years[0];

  async function loadYear(year) {
    loadingEl.hidden = false;
    photoGrid.innerHTML = '';
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('year', String(year));
    window.history.replaceState({}, '', url);

    renderYearPicker(years, year, yearPicker, loadYear);

    const res = await fetch(`/api/public/gallery?program=${program}&year=${year}`);
    const data = await res.json();
    loadingEl.hidden = true;
    renderGrid(data.photos ?? [], photoGrid, openLightbox);
  }

  await loadYear(activeYear);
}

// Only auto-init in a real browser context (not during unit tests).
// Check for a gallery-root element as a sentinel — the test DOM doesn't include it.
if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.readyState !== undefined) {
  const autoInit = () => {
    if (document.getElementById('gallery-root')) init();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}
