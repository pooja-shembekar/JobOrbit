import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { apiFetch, readApiResponse } from '../lib/api';

function CareerAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');
  const [error, setError] = useState('');

  if (user?.role !== 'candidate') return null;

  const sendMessage = async (question = message) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setError('');
    setLastQuestion(trimmed);
    if (question === message) {
      setMessages((previous) => [...previous, { role: 'user', content: trimmed }]);
      setMessage('');
    }
    setLoading(true);
    try {
      const response = await apiFetch('/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await readApiResponse(response, 'Career assistant');
      setMessages((previous) => [...previous, { role: 'assistant', content: data.reply, mode: data.mode }]);
    } catch (requestError) {
      setError(requestError.message || 'The assistant is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <section aria-label="JobOrbit Career Assistant" className="mb-3 flex h-[min(32rem,calc(100dvh-7rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="text-sm font-semibold">Career Assistant</h2>
              <p className="text-xs text-slate-300">JobOrbit</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Career Assistant" className="rounded p-1 text-slate-200 hover:bg-slate-700">×</button>
          </header>
          <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 && (
              <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                Ask about job requirements, your applications, skill gaps, resumes or interview preparation.
              </p>
            )}
            {messages.map((entry, index) => (
              <div key={`${entry.role}-${index}`} className={`max-w-[90%] rounded-lg p-3 text-sm leading-relaxed ${entry.role === 'user' ? 'ml-auto bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                <p className="whitespace-pre-wrap break-words">{entry.content}</p>
                {entry.mode === 'fallback' && <span className="mt-2 block text-[11px] text-slate-500">Guidance fallback</span>}
                {entry.mode === 'ai' && <span className="mt-2 block text-[11px] text-slate-500">AI-generated response</span>}
              </div>
            ))}
            {loading && <p className="text-xs text-slate-500">Preparing a response…</p>}
            {error && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <p>{error}</p>
                <button type="button" onClick={() => sendMessage(lastQuestion)} disabled={loading} className="mt-2 font-semibold underline disabled:opacity-50">Retry</button>
              </div>
            )}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
            <label className="sr-only" htmlFor="careerAssistantMessage">Message Career Assistant</label>
            <textarea
              id="careerAssistantMessage"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1200}
              rows={2}
              placeholder="Ask a career question"
              className="min-h-10 min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button type="submit" disabled={loading || !message.trim()} aria-label="Send message" className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-label={open ? 'Close Career Assistant' : 'Open Career Assistant'}
        className="ml-auto flex h-12 items-center gap-2 rounded-full bg-blue-700 px-4 text-sm font-semibold text-white shadow-lg hover:bg-blue-800"
      >
        <span aria-hidden="true">✦</span> Career Assistant
      </button>
    </div>
  );
}

export default CareerAssistant;
