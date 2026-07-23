// admin/src/__tests__/Gallery.test.tsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Gallery from '../pages/Gallery';

// Mock the api module
vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}));
import { apiFetch } from '../api';
const mockApiFetch = vi.mocked(apiFetch);

// Mock theme so useProgram returns the string 'mens' directly
vi.mock('../theme', () => ({
  useProgram: () => 'mens',
}));

const sampleYears = { ok: true, years: [2026, 2025] };
const samplePhotos = {
  ok: true,
  photos: [
    {
      id: 1,
      r2_key: 'photos/mens/2026/a.png',
      caption: 'Alpha',
      sort: 0,
      year: 2026,
      width: 800,
      height: 600,
      content_type: 'image/png',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      r2_key: 'photos/mens/2026/b.png',
      caption: 'Beta',
      sort: 1,
      year: 2026,
      width: 400,
      height: 300,
      content_type: 'image/png',
      created_at: '2026-01-02T00:00:00Z',
    },
  ],
};

function setup() {
  return render(
    <MemoryRouter>
      <Gallery />
    </MemoryRouter>,
  );
}

describe('Gallery admin page', () => {
  beforeEach(() => {
    // Reset clears both call history and the mock queue
    mockApiFetch.mockReset();
    // Default: years then photos for active year
    mockApiFetch
      .mockResolvedValueOnce(sampleYears)
      .mockResolvedValueOnce(samplePhotos);
  });

  it('renders year tabs and photo list', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('2026')).toBeInTheDocument();
      expect(screen.getByText('2025')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  it('shows upload zone with file input', async () => {
    setup();
    await waitFor(() => screen.getByText('Alpha'));
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('image/');
  });

  it('calls DELETE endpoint and removes photo from list on confirm', async () => {
    const user = userEvent.setup();

    // Full sequence: years, initial photos, DELETE, re-fetch (minus Beta)
    mockApiFetch.mockReset();
    mockApiFetch
      .mockResolvedValueOnce(sampleYears)
      .mockResolvedValueOnce(samplePhotos)
      .mockResolvedValueOnce({ ok: true }) // DELETE
      .mockResolvedValueOnce({ ok: true, photos: [samplePhotos.photos[0]] }); // re-fetch

    setup();
    await waitFor(() => screen.getByText('Beta'));

    // Click delete on Beta (second photo)
    const deleteButtons = screen.getAllByRole('button', {
      name: /delete photo/i,
    });
    await user.click(deleteButtons[1]);

    // Confirm dialog
    const confirmBtn = await screen.findByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/photos/2'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });
  });

  it('calls PATCH endpoint on caption save', async () => {
    const user = userEvent.setup();

    // Full sequence: years, initial photos, PATCH, re-fetch with updated caption
    mockApiFetch.mockReset();
    mockApiFetch
      .mockResolvedValueOnce(sampleYears)
      .mockResolvedValueOnce(samplePhotos)
      .mockResolvedValueOnce({
        ok: true,
        photo: { ...samplePhotos.photos[0], caption: 'Updated' },
      })
      .mockResolvedValueOnce({
        ok: true,
        photos: [
          { ...samplePhotos.photos[0], caption: 'Updated' },
          samplePhotos.photos[1],
        ],
      });

    setup();
    await waitFor(() => screen.getByText('Alpha'));

    // Click edit on first photo
    const editButtons = screen.getAllByRole('button', {
      name: /edit caption/i,
    });
    await user.click(editButtons[0]);

    const input = await screen.findByDisplayValue('Alpha');
    await user.clear(input);
    await user.type(input, 'Updated');

    const saveBtn = screen.getByRole('button', { name: /save caption/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/photos/1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ caption: 'Updated' }),
        }),
      );
    });
  });

  it('shows upload error when a non-image file is dropped', async () => {
    setup();
    await waitFor(() => screen.getByText('Alpha'));

    const dropZone = screen.getByTestId('upload-dropzone');
    const nonImageFile = new File(['text'], 'doc.txt', { type: 'text/plain' });
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [nonImageFile] },
    });

    await waitFor(() => {
      expect(screen.getByText(/image files only/i)).toBeInTheDocument();
    });
  });

  it('fetches photos when year tab is clicked', async () => {
    const user = userEvent.setup();

    // Initial load + clicking 2025 tab
    mockApiFetch.mockReset();
    mockApiFetch
      .mockResolvedValueOnce(sampleYears)
      .mockResolvedValueOnce(samplePhotos)
      .mockResolvedValueOnce({ ok: true, photos: [] });

    setup();
    await waitFor(() => screen.getByText('2025'));

    await user.click(screen.getByText('2025'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/photos?year=2025'),
      );
    });
  });
});
