import { useState, useEffect, useRef, useCallback } from 'react';
import { ai } from '../api';
import { useProgram } from '../App';

interface AiMessage {
  id: number;
  thread_id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
}

interface PendingAction {
  id: number;
  thread_id: number | null;
  program: string;
  kind: 'send_campaign' | 'schedule_campaign';
  summary: string;
  payload: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  created_at: string;
}

interface AssistantProps {
  /** Override program (used in tests). Defaults to ProgramContext value. */
  program?: string;
}

export default function Assistant({ program: programProp }: AssistantProps) {
  const { program: contextProgram } = useProgram();
  const program = programProp ?? contextProgram;
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchPending = useCallback(() => {
    ai.listPending(program).then(
      (res: { ok: boolean; pending_actions?: PendingAction[] }) => {
        if (res.ok) setPendingActions(res.pending_actions ?? []);
      },
    );
  }, [program]);

  // Start a new thread on mount / program change
  useEffect(() => {
    setThreadId(null);
    setMessages([]);
    setError(null);
    ai.createThread(program, `${program} — ${new Date().toLocaleDateString()}`).then(
      (res: { ok: boolean; thread?: { id: number } }) => {
        if (res.ok && res.thread) setThreadId(res.thread.id);
      },
    );
    fetchPending();
  }, [program, fetchPending]);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || !threadId || loading) return;
    const userText = input.trim();
    setInput('');
    setLoading(true);
    setError(null);

    // Optimistic user message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        thread_id: threadId,
        role: 'user',
        content: userText,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const res = await ai.sendMessage(program, threadId, userText);
      if (!res.ok) throw new Error(res.error ?? 'Unknown error');
      setMessages(res.messages.filter((m: AiMessage) => m.role !== 'tool'));
      if (res.pending_actions?.length > 0) {
        fetchPending();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: number) {
    setError(null);
    const res = await ai.approvePending(program, id);
    if (!res.ok) {
      setError(res.error ?? 'Approve failed');
      return;
    }
    fetchPending();
  }

  async function handleReject(id: number) {
    setError(null);
    const res = await ai.rejectPending(program, id);
    if (!res.ok) {
      setError(res.error ?? 'Reject failed');
      return;
    }
    fetchPending();
  }

  return (
    <div className="flex h-full gap-6 p-6">
      {/* ── Chat panel ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-gray-700">
          AI Assistant
        </div>

        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages
            .filter((m) => m.role !== 'tool')
            .map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-xl px-4 py-2 text-sm text-gray-400 animate-pulse">
                Thinking…
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="px-4 py-2 text-sm text-red-600 border-t">{error}</div>
        )}

        <div className="flex gap-2 p-3 border-t">
          <input
            type="text"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask about registrations, counts, drafts…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) handleSend();
            }}
            disabled={loading || !threadId}
            aria-label="Message input"
          />
          <button
            onClick={handleSend}
            disabled={loading || !threadId || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* ── Pending approvals panel ────────────────────────────────────── */}
      <div className="w-80 flex flex-col bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-gray-700">
          Pending Approvals
          {pendingActions.length > 0 && (
            <span className="ml-2 bg-red-500 text-white rounded-full px-2 py-0.5 text-xs">
              {pendingActions.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {pendingActions.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-8">
              No pending actions.
            </p>
          )}
          <p className="text-xs text-gray-400 italic px-1">
            The assistant drafted these — nothing sends until you approve.
          </p>
          {pendingActions.map((action) => (
            <div
              key={action.id}
              className="border rounded-lg p-3 text-sm"
              data-testid={`pending-action-${action.id}`}
            >
              <div className="font-medium text-gray-800 mb-1">
                {action.kind === 'send_campaign'
                  ? '📤 Send Campaign'
                  : '📅 Schedule Campaign'}
              </div>
              <p className="text-gray-600 text-xs mb-3">{action.summary}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(action.id)}
                  className="flex-1 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  aria-label={`Approve: ${action.summary}`}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(action.id)}
                  className="flex-1 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                  aria-label={`Reject: ${action.summary}`}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
