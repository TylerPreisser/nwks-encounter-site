// public/gallery/gallery.test.js
// Run with: npx vitest run --environment jsdom public/gallery/gallery.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// We test the renderYearPicker and renderGrid functions exported from gallery.js
// gallery.js uses ES modules with explicit exports for testability.

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

async function loadGalleryModule() {
  // Re-import fresh module each test
  vi.resetModules();
  return await import('./gallery.js');
}

describe('gallery.js — year picker rendering', () => {
  it('renderYearPicker builds one button per year', async () => {
    const dom = new JSDOM('<!doctype html><div id="year-picker"></div>');
    global.document = dom.window.document;
    const { renderYearPicker } = await loadGalleryModule();
    const container = dom.window.document.getElementById('year-picker');
    renderYearPicker([2026, 2025, 2024], 2025, container, () => {});
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[1].textContent).toBe('2025');
    expect(buttons[1].classList.contains('active')).toBe(true);
    expect(buttons[0].classList.contains('active')).toBe(false);
  });

  it('renderYearPicker calls onSelect with the year on click', async () => {
    const dom = new JSDOM('<!doctype html><div id="year-picker"></div>');
    global.document = dom.window.document;
    const { renderYearPicker } = await loadGalleryModule();
    const container = dom.window.document.getElementById('year-picker');
    const onSelect = vi.fn();
    renderYearPicker([2026, 2025], 2026, container, onSelect);
    container.querySelectorAll('button')[1].click();
    expect(onSelect).toHaveBeenCalledWith(2025);
  });
});

describe('gallery.js — photo grid rendering', () => {
  it('renderGrid creates one figure per photo with correct src and alt', async () => {
    const dom = new JSDOM('<!doctype html><div id="photo-grid"></div>');
    global.document = dom.window.document;
    const { renderGrid } = await loadGalleryModule();
    const container = dom.window.document.getElementById('photo-grid');
    const photos = [
      { id: 1, url: '/api/public/photo/1', caption: 'First', width: 800, height: 600 },
      { id: 2, url: '/api/public/photo/2', caption: null, width: 400, height: 300 },
    ];
    renderGrid(photos, container, () => {});
    const figures = container.querySelectorAll('figure');
    expect(figures).toHaveLength(2);
    const img = figures[0].querySelector('img');
    expect(img.getAttribute('src')).toBe('/api/public/photo/1');
    expect(img.getAttribute('alt')).toBe('First');
    // Null caption → empty alt
    const img2 = figures[1].querySelector('img');
    expect(img2.getAttribute('alt')).toBe('');
  });

  it('renderGrid calls onPhotoClick with the photo object on click', async () => {
    const dom = new JSDOM('<!doctype html><div id="photo-grid"></div>');
    global.document = dom.window.document;
    const { renderGrid } = await loadGalleryModule();
    const container = dom.window.document.getElementById('photo-grid');
    const onPhotoClick = vi.fn();
    const photo = { id: 3, url: '/api/public/photo/3', caption: 'Click me', width: 1, height: 1 };
    renderGrid([photo], container, onPhotoClick);
    container.querySelector('figure').click();
    expect(onPhotoClick).toHaveBeenCalledWith(photo);
  });

  it('renderGrid shows empty-state message when photos array is empty', async () => {
    const dom = new JSDOM('<!doctype html><div id="photo-grid"></div>');
    global.document = dom.window.document;
    const { renderGrid } = await loadGalleryModule();
    const container = dom.window.document.getElementById('photo-grid');
    renderGrid([], container, () => {});
    expect(container.querySelector('figure')).toBeNull();
    expect(container.textContent).toMatch(/no photos/i);
  });
});
