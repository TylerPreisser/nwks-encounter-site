// admin/src/pages/Gallery.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { useProgram } from '../theme';
import { apiFetch } from '../api';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB = 10;

interface Photo {
  id: number;
  r2_key: string;
  caption: string | null;
  sort: number;
  year: number;
  width: number;
  height: number;
  content_type: string;
  created_at: string;
}

interface UploadItem {
  file: File;
  progress: 'uploading' | 'error';
  error?: string;
}

export default function Gallery() {
  const program = useProgram();
  const [years, setYears] = useState<number[]>([]);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load years ──────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch<{ ok: boolean; years: number[] }>(`/public/gallery/years`)
      .then((data) => {
        const ys = data.years ?? [];
        setYears(ys);
        setActiveYear(ys[0] ?? null);
      })
      .catch(() => {
        // No photos yet
        setYears([]);
        setActiveYear(null);
        setLoading(false);
      });
  }, [program]);

  // ── Load photos for active year ─────────────────────────────────────
  const loadPhotos = useCallback(
    async (year: number) => {
      setLoading(true);
      const data = await apiFetch<{ ok: boolean; photos: Photo[] }>(
        `/admin/photos?year=${year}`,
      );
      setPhotos(data.photos ?? []);
      setLoading(false);
    },
    [program],
  );

  useEffect(() => {
    if (activeYear !== null) {
      loadPhotos(activeYear);
    }
  }, [activeYear, loadPhotos]);

  // ── File validation ─────────────────────────────────────────────────
  function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type))
      return 'Image files only (JPEG, PNG, WebP, GIF).';
    if (file.size > MAX_SIZE_MB * 1024 * 1024)
      return `File too large (max ${MAX_SIZE_MB} MB).`;
    return null;
  }

  // ── Upload ──────────────────────────────────────────────────────────
  async function uploadFile(file: File) {
    const err = validateFile(file);
    if (err) {
      setUploadError(err);
      return;
    }
    setUploadError(null);

    const item: UploadItem = { file, progress: 'uploading' };
    setUploads((prev) => [...prev, item]);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', String(activeYear ?? new Date().getFullYear()));
    fd.append('caption', '');

    try {
      const data = await apiFetch<{ ok: boolean; error?: string }>(
        `/admin/photos`,
        { method: 'POST', body: fd },
      );
      setUploads((prev) => prev.filter((u) => u.file !== file));
      if (data.ok && activeYear !== null) {
        await loadPhotos(activeYear);
      }
    } catch {
      setUploads((prev) =>
        prev.map((u) =>
          u.file === file ? { ...u, progress: 'error' as const, error: 'Upload failed' } : u,
        ),
      );
    }
  }

  // ── Drag handlers ───────────────────────────────────────────────────
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(uploadFile);
    e.target.value = '';
  }

  // ── Caption edit ────────────────────────────────────────────────────
  function startEdit(photo: Photo) {
    setEditingId(photo.id);
    setEditCaption(photo.caption ?? '');
  }

  async function saveCaption(id: number) {
    await apiFetch(`/admin/photos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ caption: editCaption }),
    });
    setEditingId(null);
    if (activeYear !== null) await loadPhotos(activeYear);
  }

  // ── Delete ──────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (deleteTarget === null) return;
    await apiFetch(`/admin/photos/${deleteTarget}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (activeYear !== null) await loadPhotos(activeYear);
  }

  // ── Sort (move up/down) ─────────────────────────────────────────────
  async function movePhoto(photo: Photo, direction: 'up' | 'down') {
    const idx = photos.findIndex((p) => p.id === photo.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= photos.length) return;
    const swap = photos[swapIdx];
    await Promise.all([
      apiFetch(`/admin/photos/${photo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sort: swap.sort }),
      }),
      apiFetch(`/admin/photos/${swap.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sort: photo.sort }),
      }),
    ]);
    if (activeYear !== null) await loadPhotos(activeYear);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Photo Gallery</h1>

      {/* Year tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setActiveYear(y)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors ${
              y === activeYear
                ? 'text-white border-transparent'
                : 'hover:text-white'
            }`}
            style={
              y === activeYear
                ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
                : { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }
            }
          >
            {y}
          </button>
        ))}
        {years.length === 0 && !loading && (
          <span className="text-gray-400 text-sm">
            No years yet — upload a photo to create one.
          </span>
        )}
      </div>

      {/* Upload zone */}
      <div
        data-testid="upload-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 mb-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-400' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <p className="text-gray-500 font-medium">
          Drag photos here or click to select
        </p>
        <p className="text-xs text-gray-400 mt-1">
          JPEG, PNG, WebP, GIF · max 10 MB each
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {uploadError && (
        <p className="text-red-600 text-sm mb-4" role="alert">
          {uploadError}
        </p>
      )}

      {/* Upload progress */}
      {uploads.map((u, i) => (
        <div key={i} className="flex items-center gap-2 text-sm mb-2">
          <span className="truncate max-w-xs">{u.file.name}</span>
          {u.progress === 'uploading' && (
            <span className="text-gray-500">Uploading…</span>
          )}
          {u.progress === 'error' && (
            <span className="text-red-500">{u.error}</span>
          )}
        </div>
      ))}

      {/* Photo grid */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : photos.length === 0 && activeYear !== null ? (
        <p className="text-gray-400 text-sm">
          No photos for {activeYear} yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              className="group relative rounded-lg overflow-hidden bg-gray-100 shadow-sm"
            >
              <img
                src={`/api/public/photo/${photo.id}`}
                alt={photo.caption ?? ''}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />

              {/* Caption */}
              <div className="p-2">
                {editingId === photo.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      className="flex-1 text-xs border rounded px-1 py-0.5"
                      autoFocus
                    />
                    <button
                      onClick={() => saveCaption(photo.id)}
                      className="text-xs bg-green-600 text-white px-2 py-0.5 rounded"
                      aria-label="Save caption"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-500"
                      aria-label="Cancel edit"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 truncate">
                    {photo.caption ?? (
                      <em className="text-gray-400">No caption</em>
                    )}
                  </p>
                )}
              </div>

              {/* Actions overlay */}
              <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(photo)}
                  className="bg-white/90 rounded p-1 text-xs shadow hover:bg-white"
                  aria-label="Edit caption"
                  title="Edit caption"
                >
                  ✏️
                </button>
                <button
                  onClick={() => movePhoto(photo, 'up')}
                  disabled={idx === 0}
                  className="bg-white/90 rounded p-1 text-xs shadow hover:bg-white disabled:opacity-30"
                  aria-label="Move up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => movePhoto(photo, 'down')}
                  disabled={idx === photos.length - 1}
                  className="bg-white/90 rounded p-1 text-xs shadow hover:bg-white disabled:opacity-30"
                  aria-label="Move down"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => setDeleteTarget(photo.id)}
                  className="bg-red-500/90 text-white rounded p-1 text-xs shadow hover:bg-red-600"
                  aria-label="Delete photo"
                  title="Delete photo"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold mb-2">Delete Photo?</h2>
            <p className="text-gray-600 text-sm mb-4">
              This permanently removes the photo from R2 and the database. This
              cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                aria-label="Confirm delete"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
