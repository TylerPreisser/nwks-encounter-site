import { useState } from 'react';
import { TemplateEditor } from '../components/email/TemplateEditor';
import { CampaignComposer } from '../components/email/CampaignComposer';
import { CampaignHistory } from '../components/email/CampaignHistory';

type Tab = 'compose' | 'templates' | 'history';

export function EmailPage() {
  const [tab, setTab] = useState<Tab>('compose');
  const [historyRefresh, setHistoryRefresh] = useState(0);

  function tabClass(t: Tab) {
    return `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Email Center</h2>

      <nav className="flex gap-2 border-b border-gray-200 mb-6">
        <button className={tabClass('compose')} onClick={() => setTab('compose')}>
          Compose
        </button>
        <button className={tabClass('templates')} onClick={() => setTab('templates')}>
          Templates
        </button>
        <button className={tabClass('history')} onClick={() => setTab('history')}>
          History
        </button>
      </nav>

      {tab === 'compose' && (
        <CampaignComposer onSent={() => { setHistoryRefresh(n => n + 1); setTab('history'); }} />
      )}
      {tab === 'templates' && <TemplateEditor />}
      {tab === 'history' && <CampaignHistory refresh={historyRefresh} />}
    </div>
  );
}
