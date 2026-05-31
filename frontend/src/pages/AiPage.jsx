import { useState } from 'react';
import { api } from '../lib/api';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function AiPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      title: 'Rehla Assistant',
      answer: 'System online. I can analyze your database in real-time. Try asking me about revenue, top products, low stock alerts, expenses, or profit margins.',
      data: []
    }
  ]);

  async function handleSend(e) {
    e.preventDefault();
    if (!query.trim()) return;

    const userQuery = query.trim();
    setMessages(prev => [...prev, { sender: 'user', answer: userQuery }]);
    setQuery('');
    setLoading(true);

    try {
      const response = await api.post('/ai/query', { query: userQuery });
      setMessages(prev => [...prev, {
        sender: 'assistant',
        title: response.title,
        answer: response.answer,
        data: response.data || []
      }]);
    } catch (err) {
      toast.error('AI query execution failed');
      setMessages(prev => [...prev, {
        sender: 'assistant',
        title: 'Error',
        answer: 'Failed to execute query. Please make sure the backend services are fully running.'
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell title="CEO AI Assistant">
      <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
        {/* Terminal/Console Messages Area */}
        <div className="card" style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          fontFamily: 'var(--font-mono)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          marginBottom: '20px'
        }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              textAlign: msg.sender === 'user' ? 'right' : 'left'
            }}>
              {msg.sender === 'user' ? (
                <div style={{ background: 'var(--color-bg-active)', padding: '12px 16px', borderRadius: '4px', display: 'inline-block' }}>
                  <span style={{ color: 'var(--color-text-dim)', marginRight: '6px' }}>&gt;</span>
                  <span>{msg.answer}</span>
                </div>
              ) : (
                <div>
                  <div style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    🤖 {msg.title || 'Assistant Response'}
                  </div>
                  <div style={{ background: 'var(--color-bg)', padding: '16px', border: '1px solid var(--color-border-light)', borderRadius: '4px' }}>
                    <p style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--color-text)' }}>{msg.answer}</p>

                    {/* Render table if AI returns structured list data */}
                    {msg.data && msg.data.length > 0 && (
                      <div className="table-container" style={{ marginTop: '16px', borderTop: '1px solid var(--color-border-light)', paddingTop: '12px' }}>
                        <table className="data-table" style={{ fontSize: '12px', background: 'transparent' }}>
                          <thead>
                            <tr>
                              {Object.keys(msg.data[0]).map((key, i) => (
                                <th key={i}>{key.toUpperCase()}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.data.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {Object.values(row).map((val, cIdx) => (
                                  <td key={cIdx} className="font-mono">
                                    {typeof val === 'number' && val > 1000 ? val.toLocaleString() : String(val)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start' }}>
              <div style={{ color: 'var(--color-success)', fontSize: '12px', marginBottom: '6px' }}>🤖 EXECUTING QUERY...</div>
              <div className="skeleton" style={{ height: '40px', width: '160px' }}></div>
            </div>
          )}
        </div>

        {/* Input prompt bar */}
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '12px' }}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything, e.g., 'show best products', 'what is low in stock?', 'show profit margins'..."
            disabled={loading}
            style={{ fontSize: '15px' }}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '0 32px' }}>
            SEND
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
