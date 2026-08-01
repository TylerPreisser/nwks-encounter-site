import React from 'react';
import type { EventFormState, NwksEvent, RolloverPreview } from '@/types/events';
import { encounterName } from '@/types/events';

interface Props {
  programLabel: string;
  currentEvent: NwksEvent;
  currentEnded: boolean;
  preview: RolloverPreview | null;
  form: EventFormState;
  setForm: (f: EventFormState) => void;
  confirmYear: string;
  setConfirmYear: (v: string) => void;
  force: boolean;
  setForce: (v: boolean) => void;
  notifyInterest: boolean;
  setNotifyInterest: (v: boolean) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

/**
 * "Start Next Encounter" — archives the finishing encounter's board, creates
 * the next one, makes it current, and emails everyone waiting on the interest
 * queue. Typed confirmation because it is not undoable.
 */
export default function RolloverDialog({
  programLabel, currentEvent, currentEnded, preview, form, setForm,
  confirmYear, setConfirmYear, force, setForce, notifyInterest, setNotifyInterest,
  busy, error, onSubmit, onCancel,
}: Props) {
  const confirmOk = confirmYear.trim() !== '' && Number(confirmYear) === Number(form.year);
  const interestCount = preview?.interest_count ?? 0;

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Start Next Encounter"
      className="p-4 border-2 rounded-lg space-y-4"
      style={{ borderColor: 'var(--color-primary)' }}
    >
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
        Start Next {programLabel} Encounter
      </h2>

      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
        <p className="font-semibold">This will archive {encounterName(currentEvent)}:</p>
        <ul className="mt-1 list-disc list-inside space-y-0.5">
          <li>
            {preview?.registered_count ?? '…'} registration(s) — kept in{' '}
            {encounterName(currentEvent)}'s history, still editable
          </li>
          <li>
            {preview?.board_count ?? '…'} testimony/teaching board item(s) — archived; the new
            board starts empty
          </li>
        </ul>
        {!currentEnded && (
          <p className="mt-2 font-medium text-amber-800">
            ⚠ This encounter hasn't ended yet (ends {currentEvent.end_date ?? 'no end date set'}).
          </p>
        )}
      </div>

      {/* The interest queue is emailed automatically — but never silently. The
          count is shown so a blast is a decision, not a surprise. */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={notifyInterest}
          disabled={interestCount === 0}
          onChange={(e) => setNotifyInterest(e.target.checked)}
          data-testid="notify-interest"
          className="mt-0.5"
        />
        <span>
          {interestCount > 0 ? (
            <>
              Email the <strong>{interestCount}</strong>{' '}
              {interestCount === 1 ? 'person' : 'people'} on the interest list that registration is
              open
            </>
          ) : (
            <span className="text-gray-400">No one is on the interest list</span>
          )}
        </span>
      </label>

      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col text-sm font-medium gap-1">
          Year *
          <input
            type="number" required min={2020} max={2100}
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
            className="border rounded px-2 py-1"
            aria-label="Next year"
          />
        </label>
        <label className="flex flex-col text-sm font-medium gap-1">
          Season *
          <select
            required
            value={form.season}
            onChange={(e) => setForm({ ...form, season: e.target.value as 'spring' | 'fall' })}
            className="border rounded px-2 py-1"
            aria-label="Next season"
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
            placeholder={`${programLabel} Encounter ${form.year}`}
            className="border rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col text-sm font-medium gap-1">
          Start Date
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="border rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col text-sm font-medium gap-1">
          End Date
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

      <div className="flex flex-wrap gap-6">
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
        <label className="flex items-center gap-2 text-sm">
          Max attendees
          <input
            type="number" min="0" inputMode="numeric"
            value={form.attendee_limit}
            onChange={(e) => setForm({ ...form, attendee_limit: e.target.value })}
            placeholder="no cap"
            className="border rounded px-2 py-1 w-24"
            aria-label="Attendee limit"
          />
        </label>
      </div>

      {!currentEnded && (
        <label className="flex items-center gap-2 text-sm text-amber-800">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Roll over anyway, even though this encounter hasn't ended
        </label>
      )}

      <label className="flex flex-col text-sm font-medium gap-1">
        Type <strong>{form.year}</strong> to confirm
        <input
          type="text"
          value={confirmYear}
          onChange={(e) => setConfirmYear(e.target.value)}
          className="border rounded px-2 py-1 w-40"
          aria-label="Confirm year"
          placeholder={form.year}
        />
      </label>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={busy || !confirmOk || (!currentEnded && !force)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy ? 'Rolling over…' : 'Archive & Start Next Encounter'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
