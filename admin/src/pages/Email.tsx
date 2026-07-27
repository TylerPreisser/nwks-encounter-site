import { TemplateEditor } from '../components/email/TemplateEditor';

// Email Center — templates only.
// Everything the office needs lives here: the general "Men's Encounter" template
// plus any templates they've saved. They open one, edit the top/middle/bottom,
// drop in photos, and either update it or "Save as new template" for reuse.
export function EmailPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          Email Center
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Start from the general template, make it your own, and save it as a new
          template whenever you want to reuse it.
        </p>
      </div>
      <TemplateEditor />
    </div>
  );
}
