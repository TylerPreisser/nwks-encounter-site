import React from 'react';
import type { EventFormState } from '@/types/events';

interface Props {
  form: EventFormState;
  setForm: (f: EventFormState) => void;
  /** null when creating; an id when editing an existing encounter. */
  editId: number | null;
  formLabel: string;
  programLabel: string;
  saving: boolean;
  formError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  closeForm: () => void;
}

/**
 * Create / edit one encounter. Year is locked while editing because it is half
 * the encounter's identity — changing it would silently move every registration
 * attached to it to a different encounter.
 */
export default function EventForm({
  form, setForm, editId, formLabel, programLabel, saving, formError, onSubmit, closeForm,
}: Props) {
  return (
      <form
        onSubmit={onSubmit}
        aria-label={formLabel}
        className="p-4 border rounded-lg bg-gray-50 space-y-3"
      >
        <h2 className="text-lg font-semibold">
          {editId !== null ? 'Edit Event' : 'New Event'}
        </h2>

        {formError && (
          <p role="alert" className="text-red-600 text-sm">{formError}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col text-sm font-medium gap-1">
            Year *
            <input
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              required
              min={2020}
              max={2100}
              disabled={editId !== null}
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col text-sm font-medium gap-1">
            Season *
            <select
              value={form.season}
              onChange={(e) => setForm({ ...form, season: e.target.value as 'spring' | 'fall' })}
              required
              className="border rounded px-2 py-1"
              aria-label="Season"
            >
              <option value="spring">Spring</option>
              <option value="fall">Fall</option>
            </select>
          </label>

          <label className="flex flex-col text-sm font-medium gap-1">
            Title
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={`${programLabel} Encounter ${form.season === 'fall' ? 'Fall' : 'Spring'} ${form.year}`}
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col text-sm font-medium gap-1">
            Start Date (YYYY-MM-DD)
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="border rounded px-2 py-1"
            />
          </label>

          <label className="flex flex-col text-sm font-medium gap-1">
            End Date (YYYY-MM-DD)
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="border rounded px-2 py-1"
            />
          </label>
        </div>

        <label className="flex flex-col text-sm font-medium gap-1">
          Launch Locations (comma-separated)
          <input
            type="text"
            value={form.launch_locations}
            onChange={(e) => setForm({ ...form, launch_locations: e.target.value })}
            placeholder="Colby, Hays, Dodge City"
            className="border rounded px-2 py-1"
          />
        </label>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.attendee_registration_open}
              onChange={(e) => setForm({ ...form, attendee_registration_open: e.target.checked })}
            />
            Attendee registration open
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.server_registration_open}
              onChange={(e) => setForm({ ...form, server_registration_open: e.target.checked })}
            />
            Server registration open
          </label>
        </div>

        {/* ── Attendee cap ─────────────────────────────────────── */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50/60">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee limit (auto full)</p>
          <label className="flex flex-col text-sm font-medium gap-1">
            Max attendees <span className="font-normal text-gray-400">— leave blank for no limit</span>
            <input
              type="number" min="0" inputMode="numeric"
              value={form.attendee_limit}
              onChange={(e) => setForm({ ...form, attendee_limit: e.target.value })}
              placeholder="e.g. 60"
              className="border rounded px-2 py-1 w-40"
              aria-label="Attendee limit"
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            "Currently full" message <span className="font-normal text-gray-400">— shown when the limit is reached</span>
            <textarea
              value={form.attendee_full_message}
              onChange={(e) => setForm({ ...form, attendee_full_message: e.target.value })}
              placeholder="This upcoming Encounter is currently full…"
              className="border rounded px-2 py-1.5 text-sm min-h-[3rem]"
              aria-label="Attendee full message"
            />
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--color-secondary)' }}
          >
            {saving ? 'Saving…' : editId !== null ? 'Save Changes' : 'Create Event'}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
    </form>
  );
}
