import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// PUBLIC_INTERFACE
function App() {
  // State for chat messages (array of { sender, text, timestamp })
  const [messages, setMessages] = useState([]);
  // Input text state
  const [input, setInput] = useState('');
  // Session ID for persistent context
  const [sessionId, setSessionId] = useState(null);
  // Loading state to indicate bot is replying
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // On mount, create or resume session
  useEffect(() => {
    // Try to get from localStorage for session persistence between reloads
    const stored = window.localStorage.getItem('chat_session_id');
    if (stored) {
      setSessionId(stored);
      // Optionally, fetch existing history and preload
      fetch(`${getBackendUrl()}/session/${stored}`)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then((data) => {
          if (Array.isArray(data.history)) setMessages(data.history);
        })
        .catch(() => {
          // fall back to new session if error
          createSession();
        });
    } else {
      createSession();
    }
    // eslint-disable-next-line
  }, []);

  // Utility: get backend base URL (supports dev/prod/staging)
  function getBackendUrl() {
    // Adjust this as needed for deployment or use a .env for REACT_APP_API_URL
    return process.env.REACT_APP_API_URL || 'https://vscode-internal-927-dev.dev01.cloud.kavia.ai:3001';
  }

  // Create a new session
  function createSession() {
    fetch(`${getBackendUrl()}/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        setSessionId(data.session_id);
        window.localStorage.setItem('chat_session_id', data.session_id);
        setMessages([]); // New session, empty history
      });
  }

  // Handle input change
  function handleInput(e) {
    setInput(e.target.value);
  }

  // Handle form submit
  function handleSend(e) {
    e.preventDefault();
    if (input.trim().length === 0 || isLoading) return;
    sendMessage(input);
    setInput('');
  }

  // Send message to backend and update chat
  async function sendMessage(text) {
    const userMsg = { sender: 'user', text, timestamp: new Date().toISOString() };
    setMessages((msgs) => [...msgs, userMsg]);
    setIsLoading(true);

    let chatPayload = {
      message: text,
      session_id: sessionId,
    };

    let response = null;
    try {
      const res = await fetch(`${getBackendUrl()}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
      });
      response = await res.json();
      if (!res.ok) throw new Error(response.detail || 'Backend error');
      setSessionId(response.session_id); // If it ever changes/new
      window.localStorage.setItem('chat_session_id', response.session_id);
      if (Array.isArray(response.history)) setMessages(response.history);
      else setMessages((msgs) => [...msgs, { sender: 'bot', text: response.response, timestamp: new Date().toISOString() }]);
    } catch (error) {
      setMessages((msgs) => [
        ...msgs,
        {
          sender: 'bot',
          text: `Sorry, there was a problem with the chat server. (${error.message})`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // UI: Render a single chat bubble (minimal/chat style)
  function MessageBubble({ sender, text, timestamp, isLast, isLoadingBubble }) {
    const isUser = sender === 'user';
    return (
      <div
        className={`chat-bubble${isUser ? ' user-bubble' : ' bot-bubble'}${isLast ? ' last-bubble' : ''}`}
        tabIndex={0}
        aria-label={(isUser ? 'You:' : 'Bot:') + ' ' + text}
      >
        <span className="bubble-sender">{isUser ? 'You' : 'KAVIA AI'}</span>
        <span className="bubble-text">{text}</span>
        <span className="bubble-timestamp">{/* Could format if displaying time */}</span>
        {isLoadingBubble && <span className="bubble-loader"><span className="dot dot1"></span><span className="dot dot2"></span><span className="dot dot3"></span></span>}
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div className="logo">
              <span className="logo-symbol">*</span> KAVIA AI Chat
            </div>
          </div>
        </div>
      </nav>

      <main className="chat-main">
        <div className="container chat-container">
          {/* Chat window/messages */}
          <div className="chat-window" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty">Say hello to your AI assistant!</div>
            )}
            {messages.map((msg, i) =>
              <MessageBubble
                key={i}
                sender={msg.sender}
                text={msg.text}
                timestamp={msg.timestamp}
                isLast={i === messages.length - 1}
                isLoadingBubble={false}
              />
            )}
            {isLoading && <MessageBubble sender="bot" text="..." isLoadingBubble={true} />}
            <div ref={messagesEndRef} />
          </div>
          {/* Chat input */}
          <form className="chat-inputbar" onSubmit={handleSend} autoComplete="off">
            <input
              className="chat-input"
              name="message"
              type="text"
              placeholder={isLoading ? "Waiting for reply..." : "Type your message..."}
              autoFocus
              value={input}
              onChange={handleInput}
              disabled={isLoading}
              aria-label="Type your message"
              maxLength={512}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  handleSend(e);
                }
              }}
            />
            <button className="btn chat-send-btn" type="submit" disabled={isLoading || input.trim().length === 0} aria-label="Send">
              <span aria-hidden="true">{isLoading ? <span className="loader-dot">...</span> : "➤"}</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;