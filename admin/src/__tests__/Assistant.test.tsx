import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Assistant from '../pages/Assistant';

// Mock the api module
vi.mock('../api', () => ({
  ai: {
    createThread: vi.fn().mockResolvedValue({ ok: true, thread: { id: 1 } }),
    sendMessage: vi.fn().mockResolvedValue({
      ok: true,
      messages: [
        { id: 1, thread_id: 1, role: 'user', content: 'How many attendees?', created_at: '' },
        { id: 2, thread_id: 1, role: 'assistant', content: 'You have 42 attendees.', created_at: '' },
      ],
      pending_actions: [],
    }),
    listPending: vi.fn().mockResolvedValue({ ok: true, pending_actions: [] }),
    approvePending: vi.fn().mockResolvedValue({ ok: true }),
    rejectPending: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Assistant page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the chat input and pending approvals panel', async () => {
    render(<Assistant program="mens" />);
    expect(screen.getByLabelText('Message input')).toBeInTheDocument();
    expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
  });

  it('sends a message and displays the assistant response', async () => {
    render(<Assistant program="mens" />);
    await waitFor(() =>
      expect(screen.queryByText('Thinking…')).not.toBeInTheDocument(),
    );

    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: 'How many attendees?' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() =>
      expect(screen.getByText('You have 42 attendees.')).toBeInTheDocument(),
    );
  });

  it('shows a pending action when one is returned', async () => {
    const { ai: mockAi } = await import('../api');
    (mockAi.listPending as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      pending_actions: [
        {
          id: 7,
          thread_id: 1,
          program: 'mens',
          kind: 'send_campaign',
          summary: 'Send packing list to all 47 attendees.',
          payload: '{}',
          status: 'pending',
          created_at: '',
        },
      ],
    });

    render(<Assistant program="mens" />);

    await waitFor(() =>
      expect(
        screen.getByText('Send packing list to all 47 attendees.'),
      ).toBeInTheDocument(),
    );

    expect(screen.getByLabelText('Approve: Send packing list to all 47 attendees.')).toBeInTheDocument();
    expect(screen.getByLabelText('Reject: Send packing list to all 47 attendees.')).toBeInTheDocument();
  });

  it('calls approvePending when Approve is clicked', async () => {
    const { ai: mockAi } = await import('../api');
    (mockAi.listPending as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      pending_actions: [
        {
          id: 7,
          thread_id: 1,
          program: 'mens',
          kind: 'send_campaign',
          summary: 'Test blast.',
          payload: '{}',
          status: 'pending',
          created_at: '',
        },
      ],
    });

    render(<Assistant program="mens" />);
    await waitFor(() => screen.getByText('Test blast.'));

    fireEvent.click(screen.getByLabelText('Approve: Test blast.'));
    await waitFor(() =>
      expect(mockAi.approvePending).toHaveBeenCalledWith('mens', 7),
    );
  });

  it('calls rejectPending when Reject is clicked', async () => {
    const { ai: mockAi } = await import('../api');
    (mockAi.listPending as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      pending_actions: [
        {
          id: 9,
          thread_id: 1,
          program: 'mens',
          kind: 'schedule_campaign',
          summary: 'Schedule reminder.',
          payload: '{}',
          status: 'pending',
          created_at: '',
        },
      ],
    });

    render(<Assistant program="mens" />);
    await waitFor(() => screen.getByText('Schedule reminder.'));

    fireEvent.click(screen.getByLabelText('Reject: Schedule reminder.'));
    await waitFor(() =>
      expect(mockAi.rejectPending).toHaveBeenCalledWith('mens', 9),
    );
  });

  it('refetches pending actions on program change', async () => {
    const { ai: mockAi } = await import('../api');
    const listPendingMock = mockAi.listPending as ReturnType<typeof vi.fn>;
    const createThreadMock = mockAi.createThread as ReturnType<typeof vi.fn>;

    listPendingMock.mockResolvedValue({ ok: true, pending_actions: [] });
    createThreadMock.mockResolvedValue({ ok: true, thread: { id: 1 } });

    const { rerender } = render(<Assistant program="mens" />);

    await waitFor(() => expect(listPendingMock).toHaveBeenCalledWith('mens'));

    rerender(<Assistant program="women" />);

    await waitFor(() => expect(listPendingMock).toHaveBeenCalledWith('women'));
  });
});
