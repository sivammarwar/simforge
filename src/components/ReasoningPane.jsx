import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, AlertTriangle, X, HelpCircle, ArrowRight, Edit2, RotateCcw, Check, LoaderCircle } from 'lucide-react';
import { rankTrizPrinciples } from '../services/triz';

export default function ReasoningPane({
  messages,
  onSendMessage,
  onClearChat,
  clarificationQuestions, // array of { id, text, chips: [] }
  onAnswerQuestion,
  trizContradiction, // if contradiction is active
  onOpenTrizWizard,
  onDismissTriz,
  trizWizardActive,
  onCloseTrizWizard,
  activeDomain,
  onEditMessage,
  onRetryMessage
}) {
  const [inputValue, setInputValue] = useState('');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editInputValue, setEditInputValue] = useState('');
  const [animatedMessages, setAnimatedMessages] = useState({});
  const [stoppedMessages, setStoppedMessages] = useState({});
  const [completedAnimatedMessages, setCompletedAnimatedMessages] = useState({});
  const threadEndRef = useRef(null);
  const textareaRef = useRef(null);

  const activeTypingMessage = [...messages].reverse().find(msg => (
    msg.sender === 'ai' &&
    msg.animated &&
    !stoppedMessages[msg.id] &&
    !completedAnimatedMessages[msg.id] &&
    animatedMessages[msg.id] !== msg.text
  ));
  const isTypingResponse = Boolean(activeTypingMessage);

  // Auto-scroll to bottom
  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, clarificationQuestions]);

  useEffect(() => {
    const liveMessageIds = new Set(messages.map(msg => msg.id));
    
    // Function to prune states for non-existent messages
    const pruneStateTo = (state) => {
      const prunedState = Object.fromEntries(
        Object.entries(state).filter(([id]) => liveMessageIds.has(id))
      );
      
      // Log if we removed anything (helps with debugging)
      const removed = Object.keys(state).filter(id => !liveMessageIds.has(id));
      if (removed.length > 0) {
        console.log('[ReasoningPane] Cleaned up animation for removed messages:', removed);
      }
      
      return prunedState;
    };
    
    setAnimatedMessages(prev => {
      const next = pruneStateTo(prev);
      // Only update if something actually changed
      return Object.keys(prev).length === Object.keys(next).length ? prev : next;
    });
    
    setStoppedMessages(prev => pruneStateTo(prev));
    setCompletedAnimatedMessages(prev => pruneStateTo(prev));
    
  }, [messages]);

  useEffect(() => {
    // Find the message that should be animating right now
    const animatedMsg = [...messages].reverse().find(msg => (
      msg.sender === 'ai' &&
      msg.animated &&
      !stoppedMessages[msg.id] &&
      !completedAnimatedMessages[msg.id]
    ));

    // If no message to animate, skip
    if (!animatedMsg) {
      return;
    }

    // Get current animated text for this message
    const currentText = animatedMessages[animatedMsg.id] || '';
    
    // If animation is complete, mark it done
    if (currentText === animatedMsg.text) {
      setCompletedAnimatedMessages(prev => ({
        ...prev,
        [animatedMsg.id]: true
      }));
      return;
    }

    // Initialize animation if this is first run for this message
    if (!(animatedMsg.id in animatedMessages)) {
      setAnimatedMessages(prev => ({
        ...prev,
        [animatedMsg.id]: '' // Start with empty
      }));
      return; // Will re-run next render
    }

    // Calculate characters to reveal (faster than 2 chars/tick)
    // Aim for ~1.5 second animation for typical 200-char response
    const targetDuration = 1500; // milliseconds
    const fullLength = animatedMsg.text.length;
    const charsPerFrame = Math.max(1, Math.ceil(fullLength / (targetDuration / 15)));
    
    // Calculate next index
    const currentIndex = currentText.length;
    const nextIndex = Math.min(fullLength, currentIndex + charsPerFrame);
    
    // Set up timer with fast interval (15ms instead of 18ms)
    const timer = window.setTimeout(() => {
      setAnimatedMessages(prev => ({
        ...prev,
        [animatedMsg.id]: animatedMsg.text.slice(0, nextIndex)
      }));
    }, 15);

    // Cleanup: clear this timer if effect re-runs
    return () => {
      window.clearTimeout(timer);
    };
    
  }, [messages, animatedMessages, stoppedMessages, completedAnimatedMessages]);

  // Handle ⌘+E chat focus trigger
  useEffect(() => {
    const handleFocusInput = () => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    };
    window.addEventListener('focus-chat-input', handleFocusInput);
    return () => window.removeEventListener('focus-chat-input', handleFocusInput);
  }, []);

  // Handle auto-expanding textarea height
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(150, Math.max(54, textarea.scrollHeight))}px`;
    }
  };

  const handleSend = (clarifyOnly = false) => {
    if (isTypingResponse) {
      handleStopTyping();
      return;
    }
    if (!inputValue.trim()) return;
    onSendMessage(inputValue, { clarifyOnly });
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '54px';
    }
  };

  const handleStopTyping = () => {
    if (!activeTypingMessage) return;
    setStoppedMessages(prev => ({
      ...prev,
      [activeTypingMessage.id]: true
    }));
    setCompletedAnimatedMessages(prev => ({
      ...prev,
      [activeTypingMessage.id]: true
    }));
    setAnimatedMessages(prev => ({
      ...prev,
      [activeTypingMessage.id]: prev[activeTypingMessage.id] || ''
    }));
  };

  const handleKeyDown = (e) => {
    // ⌘+Enter or Ctrl+Enter triggers run
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      // BUGFIX: stopPropagation is REQUIRED here. App.jsx registers a global window
      // keydown listener for the SAME Cmd+Enter combo, which calls handleRunSimulation()
      // (re-running the last solver on whatever input file happens to be loaded).
      // Without stopping propagation, sending a chat message via Cmd+Enter would bubble
      // up to that global listener too, silently re-triggering "Running simulation now
      // with ngspice..." after every single message sent this way (including smalltalk
      // and non-engineering questions) — regardless of what was actually typed.
      e.stopPropagation();
      handleSend();
    }
  };

  const normalizeMathText = (text) => {
    return String(text)
      .replace(/\\,/g, ' ')
      .replace(/\\text\{([^{}]+)\}/g, '$1')
      .replace(/\\\(/g, '')
      .replace(/\\\)/g, '')
      .replace(/\\\[/g, '')
      .replace(/\\\]/g, '')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\tau/g, 'τ')
      .replace(/\\pi/g, 'π')
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\frac\{([\s\S]+?)\}\{([\s\S]+?)\}/g, '($1)/($2)')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\b([σδτFLIbhc])is\b/g, '$1 is')
      .replace(/\b([σδτFLIbhc])are\b/g, '$1 are')
      .replace(/\b([σδτFLIbhc])\s*=\s*/g, '$1 = ')
      .replace(/([A-Za-z])([23])\b/g, '$1^$2')
      .replace(/(\))([23])\b/g, '$1^$2')
      .replace(/\b(mm|cm|m|Pa|MPa|GPa|N)([234])\b/g, '$1^$2')
      .trim();
  };

  const renderPrettyText = (text, keyPrefix) => {
    const normalized = normalizeMathText(text);
    const parts = normalized.split(/(\^[+-]?\d+|[A-Za-z]+\^[+-]?\d+)/g).filter(Boolean);

    return parts.map((part, index) => {
      const unitPower = part.match(/^([A-Za-z]+)\^([+-]?\d+)$/);
      if (unitPower) {
        return (
          <React.Fragment key={`${keyPrefix}-pow-${index}`}>
            {unitPower[1]}<sup>{unitPower[2]}</sup>
          </React.Fragment>
        );
      }

      const power = part.match(/^\^([+-]?\d+)$/);
      if (power) {
        return <sup key={`${keyPrefix}-sup-${index}`}>{power[1]}</sup>;
      }

      return <React.Fragment key={`${keyPrefix}-txt-${index}`}>{part}</React.Fragment>;
    });
  };

  const renderInlineMarkdown = (text, keyPrefix) => {
    const segments = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\\\([^)]+\\\))/g);
    return segments.map((segment, index) => {
      if (segment.startsWith('**') && segment.endsWith('**')) {
        return <strong key={`${keyPrefix}-b-${index}`}>{renderPrettyText(segment.slice(2, -2), `${keyPrefix}-b-${index}`)}</strong>;
      }
      if (segment.startsWith('`') && segment.endsWith('`')) {
        return <code key={`${keyPrefix}-c-${index}`} className="inline-code">{segment.slice(1, -1)}</code>;
      }
      if (segment.startsWith('\\(') && segment.endsWith('\\)')) {
        return <code key={`${keyPrefix}-m-${index}`} className="math-chip">{renderPrettyText(segment, `${keyPrefix}-math-${index}`)}</code>;
      }
      return <React.Fragment key={`${keyPrefix}-t-${index}`}>{renderPrettyText(segment, `${keyPrefix}-t-${index}`)}</React.Fragment>;
    });
  };

  const renderDisplayMath = (line, keyPrefix) => {
    return (
      <div key={keyPrefix} className="display-math">
        {renderPrettyText(line, `${keyPrefix}-display`)}
      </div>
    );
  };

  const renderMarkdownTable = (lines, keyPrefix) => {
    const rows = lines
      .filter(line => !/^\|\s*-/.test(line))
      .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
    const [head, ...body] = rows;
    if (!head || body.length === 0) return null;

    return (
      <div className="markdown-table-wrap" key={keyPrefix}>
        <table className="markdown-table">
          <thead>
            <tr>{head.map((cell, index) => <th key={index}>{renderInlineMarkdown(cell, `${keyPrefix}-h-${index}`)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(cell, `${keyPrefix}-${rowIndex}-${cellIndex}`)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMarkdownBlock = (text, keyPrefix) => {
    const lines = String(text).split('\n');
    const output = [];
    let paragraph = [];
    let list = [];
    let table = [];

    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      output.push(
        <p key={`${keyPrefix}-p-${output.length}`} className="markdown-p">
          {renderInlineMarkdown(paragraph.join(' '), `${keyPrefix}-p-${output.length}`)}
        </p>
      );
      paragraph = [];
    };

    const flushList = () => {
      if (list.length === 0) return;
      output.push(
        <ul key={`${keyPrefix}-ul-${output.length}`} className="markdown-list">
          {list.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item, `${keyPrefix}-li-${output.length}-${index}`)}</li>
          ))}
        </ul>
      );
      list = [];
    };

    const flushTable = () => {
      if (table.length === 0) return;
      const rendered = renderMarkdownTable(table, `${keyPrefix}-tbl-${output.length}`);
      if (rendered) output.push(rendered);
      table = [];
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        flushList();
        flushTable();
        return;
      }

      if (/^\|.*\|$/.test(trimmed)) {
        flushParagraph();
        flushList();
        table.push(trimmed);
        return;
      }

      flushTable();

      if (/^\\\[/.test(trimmed) || /\\\]$/.test(trimmed)) {
        flushParagraph();
        flushList();
        output.push(renderDisplayMath(trimmed, `${keyPrefix}-eq-${index}`));
        return;
      }

      if (/^#{2,4}\s+/.test(trimmed)) {
        flushParagraph();
        flushList();
        const level = Math.min(4, trimmed.match(/^#+/)[0].length);
        const content = trimmed.replace(/^#{2,4}\s+/, '').replace(/^\d+\.\s*/, '');
        const HeadingTag = level === 2 ? 'h3' : 'h4';
        output.push(
          <HeadingTag key={`${keyPrefix}-h-${index}`} className="markdown-heading">
            {renderInlineMarkdown(content, `${keyPrefix}-heading-${index}`)}
          </HeadingTag>
        );
        return;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        flushParagraph();
        list.push(trimmed.replace(/^[-*]\s+/, ''));
        return;
      }

      paragraph.push(trimmed);
    });

    flushParagraph();
    flushList();
    flushTable();

    return output;
  };

  // Rendering messages with markdown and monospace blocks
  const renderMessageContent = (text) => {
    const textLength = String(text || '').length;
    
    // For very short/partial text, skip markdown processing
    // This prevents parsing errors on unclosed blocks during animation
    const isLikelyPartial = textLength < 50; // Less than 50 chars = probably still animating
    
    if (isLikelyPartial) {
      // Just render plain text, no markdown processing
      return <>{text}</>;
    }
    
    // For longer text, do full markdown processing
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const code = part.replace(/```/g, '').trim();
        // Remove optional language identifier line
        const lines = code.split('\n');
        const codeContent = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines.slice(1).join('\n') : code;
        return (
          <pre key={index} className="code-block">
            <code>{codeContent}</code>
          </pre>
        );
      }
      return <React.Fragment key={index}>{renderMarkdownBlock(part, `md-${index}`)}</React.Fragment>;
    });
  };

  // TRIZ Wizard state variables (internal to panel steps)
  const [trizStep, setTrizStep] = useState(1);
  const [selectedPriority, setSelectedPriority] = useState(null);

  useEffect(() => {
    if (trizWizardActive) {
      setTrizStep(1);
      setSelectedPriority(null);
    }
  }, [trizWizardActive]);

  const rankedTrizPrinciples = trizContradiction
    ? rankTrizPrinciples(trizContradiction.principles || [], selectedPriority || 'both')
    : [];

  return (
    <div className="reasoning-pane flex flex-col flex-1 relative">
      {/* Pane Header */}
      <div className="pane-header flex items-center justify-between">
        <span className="pane-title">Reasoning</span>
        {messages.length > 0 && (
          <button className="clear-btn" onClick={onClearChat}>
            Clear
          </button>
        )}
      </div>

      {/* Pane Body: Messages and Thread overlay */}
      <div className={`pane-body flex-1 flex flex-col ${trizWizardActive ? 'dimmed' : ''}`}>

        <div className="messages-thread flex-1">
          {messages.length === 0 ? (
            <div className="empty-thread flex flex-col items-center justify-center">
              <span className="welcome-example">
                Try: "I have a 5V buck converter feeding a 2A load, what does the output ripple look like with a 22µH inductor?"
              </span>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isEditing = editingMessageId === msg.id;

              return (
                <div 
                  key={msg.id || i} 
                  className={`message-row ${msg.sender === 'user' ? 'msg-user' : 'msg-ai'}`}
                >
                  <div className="message-content">
                    {msg.sender === 'ai' && <div className="ai-accent-bar" />}
                    
                    {isEditing ? (
                      <div className="flex flex-col gap-2 min-w-[220px]">
                        <textarea
                          className="w-full bg-[#0A0C0F] border border-[#252A32] rounded p-2 text-[#E8EAF0] resize-y text-xs outline-none focus:border-[#3B82F6] font-sans"
                          rows={3}
                          value={editInputValue}
                          onChange={(e) => setEditInputValue(e.target.value)}
                        />
                        <div className="flex gap-2 justify-end">
                          <button 
                            className="flex items-center gap-1 px-2 py-1 bg-[#22C55E] text-white rounded text-[11px] hover:bg-[#16a34a]"
                            onClick={() => {
                              if (editInputValue.trim()) {
                                onEditMessage(msg.id, editInputValue);
                                setEditingMessageId(null);
                              }
                            }}
                          >
                            <Check size={10} /> Save
                          </button>
                          <button 
                            className="flex items-center gap-1 px-2 py-1 bg-[#252A32] text-[#8C929E] rounded text-[11px] hover:bg-[#1C2026]"
                            onClick={() => {
                              setEditingMessageId(null);
                            }}
                          >
                            <X size={10} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="message-text">
                          {renderMessageContent(msg.animated ? (animatedMessages[msg.id] || '') : msg.text)}
                          {msg.animated && !stoppedMessages[msg.id] && !completedAnimatedMessages[msg.id] && animatedMessages[msg.id] !== msg.text && (
                            <span className="typing-caret">█</span>
                          )}
                        </div>
                        {msg.timestamp && <span className="message-time">{msg.timestamp}</span>}
                        
                        {/* Inline Actions (visible on hover) */}
                        <div className="message-actions">
                          {msg.sender === 'user' && (
                            <button
                              className="action-btn"
                              title="Edit prompt"
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditInputValue(msg.text);
                              }}
                            >
                              <Edit2 size={10} />
                            </button>
                          )}
                          <button
                            className="action-btn"
                            title={msg.sender === 'user' ? "Retry prompt formulation" : "Retry solver execution"}
                            onClick={() => onRetryMessage(msg.id)}
                          >
                            <RotateCcw size={10} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Clarification Questions (interactive chips) */}
          {clarificationQuestions && clarificationQuestions.map(q => (
            <div key={q.id} className="message-row msg-ai clarification-box">
              <div className="message-content">
                <div className="ai-accent-bar" />
                <div className="message-text flex flex-col gap-2">
                  <div className="flex items-center gap-1 font-medium text-primary">
                    <HelpCircle size={14} className="text-accent" />
                    {q.text}
                  </div>
                  <div className="chips-container flex gap-2 flex-wrap">
                    {q.chips && q.chips.map(chip => (
                      <button
                        key={chip}
                        className="chip-btn"
                        onClick={() => {
                          onAnswerQuestion(q.id, chip);
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div ref={threadEndRef} />
        </div>

        {/* TRIZ contradiction trigger banner */}
        {trizContradiction && !trizWizardActive && (
          <div className="triz-banner flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber animate-pulse" />
              <span className="triz-banner-text">
                TRIZ contradiction detected
                {trizContradiction.confidence ? ` · ${Math.round(trizContradiction.confidence * 100)}% confidence` : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="triz-action-btn" onClick={onOpenTrizWizard}>
                Guide me through it
              </button>
              <button className="triz-dismiss-btn" onClick={onDismissTriz}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="input-area">
          <textarea
            ref={textareaRef}
            rows={3}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe your system or ask a question..."
          />
          <div className="input-actions flex justify-between items-center">
            <button className="paperclip-btn" disabled title="Attachment (Disabled in Phase 1)">
              <Paperclip size={14} />
            </button>
            <div className="flex gap-2">
              <button
                className="clarify-only-btn"
                onClick={() => handleSend(true)}
                disabled={isTypingResponse}
                style={{ opacity: inputValue.trim() && !isTypingResponse ? 1 : 0.5 }}
              >
                Clarify only
              </button>
              <button className={`run-btn flex items-center gap-1 ${isTypingResponse ? 'typing-active' : ''}`} onClick={() => handleSend(false)}>
                {isTypingResponse ? (
                  <>
                    <LoaderCircle size={11} className="run-spinner" /> Stop
                  </>
                ) : (
                  <>
                    <Send size={11} /> Run ⌘↵
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TRIZ GUIDED FLOW WIZARD OVERLAY */}
      {trizWizardActive && trizContradiction && (
        <div className="triz-wizard-overlay flex flex-col">
          <div className="triz-wizard-header flex items-center justify-between">
            <span className="triz-header-title">TRIZ Guided Resolution</span>
            <button className="triz-close-btn" onClick={onCloseTrizWizard}>
              <X size={15} />
            </button>
          </div>

          <div className="triz-wizard-body flex-1 flex flex-col gap-4">
            {/* Step Indicator */}
            <div className="triz-steps-indicator flex gap-1 justify-between">
              {[1, 2, 3, 4].map(s => (
                <div 
                  key={s} 
                  className={`triz-step-bullet flex-1 ${s <= trizStep ? 'active' : ''}`}
                />
              ))}
            </div>

            {/* Step 1: Contradiction Restatement */}
            {trizStep === 1 && (
              <div className="flex flex-col gap-3 flex-1">
                <span className="step-label">STEP 1: CONTRADICTION RESTATEMENT</span>
                <div className="triz-box">
                  {trizContradiction.label && (
                    <span className="triz-contradiction-label">{trizContradiction.label}</span>
                  )}
                  <p>{trizContradiction.statement}</p>
                </div>
                <div className="triz-signal-grid">
                  <div className="triz-signal-card">
                    <span>Confidence</span>
                    <strong>{Math.round((trizContradiction.confidence || 0.5) * 100)}%</strong>
                  </div>
                  <div className="triz-signal-card">
                    <span>Severity</span>
                    <strong>{trizContradiction.severity || 'Medium'}</strong>
                  </div>
                </div>
                {trizContradiction.detectionEvidence?.length > 0 && (
                  <div className="triz-mini-section">
                    <span className="triz-mini-title">Why it triggered</span>
                    {trizContradiction.detectionEvidence.map((item, idx) => (
                      <p key={idx}>{item}</p>
                    ))}
                  </div>
                )}
                {trizContradiction.industrialChecks?.length > 0 && (
                  <div className="triz-mini-section">
                    <span className="triz-mini-title">Industrial checks</span>
                    {trizContradiction.industrialChecks.map((item, idx) => (
                      <p key={idx}>{item}</p>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2 mt-auto">
                  <button className="triz-cta-btn" onClick={() => setTrizStep(2)}>
                    Yes, let's work on this
                  </button>
                  <button className="triz-ghost-btn" onClick={onCloseTrizWizard}>
                    Not quite — let me rephrase
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Priority Question */}
            {trizStep === 2 && (
              <div className="flex flex-col gap-3 flex-1">
                <span className="step-label">STEP 2: FOCUS PRIORITY</span>
                <p className="text-secondary">Which parameter is more critical for your current simulation goal?</p>
                <div className="flex flex-col gap-2">
                  <button 
                    className={`triz-option-card ${selectedPriority === 'improving' ? 'selected' : ''}`}
                    onClick={() => setSelectedPriority('improving')}
                  >
                    Priority: {trizContradiction.improving}
                  </button>
                  <button 
                    className={`triz-option-card ${selectedPriority === 'worsening' ? 'selected' : ''}`}
                    onClick={() => setSelectedPriority('worsening')}
                  >
                    Priority: {trizContradiction.worsening}
                  </button>
                  <button 
                    className={`triz-option-card ${selectedPriority === 'both' ? 'selected' : ''}`}
                    onClick={() => setSelectedPriority('both')}
                  >
                    Both are equally important
                  </button>
                </div>
                <button 
                  className="triz-cta-btn mt-auto" 
                  disabled={!selectedPriority}
                  onClick={() => setTrizStep(3)}
                >
                  Find Inventive Principles
                </button>
              </div>
            )}

            {/* Step 3: Inventive Principles */}
            {trizStep === 3 && (
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
                <span className="step-label">STEP 3: INVENTIVE SOLUTIONS</span>
                <p className="text-secondary">Seemulator ranked the TRIZ moves by your priority and attached the industrial checks required before accepting the design change.</p>
                
                <div className="flex flex-col gap-3">
                  {rankedTrizPrinciples.map((pr, idx) => (
                    <div key={idx} className="triz-principle-card">
                      <div className="triz-card-header flex justify-between items-center">
                        <span className="principle-name">Principle {pr.num}: {pr.name}</span>
                        {idx === 0 && (
                          <span className="principle-fit-badge">best fit</span>
                        )}
                      </div>
                      <h4 className="principle-headline mt-1 text-primary font-medium">{pr.headline}</h4>
                      <p className="principle-rationale text-secondary mt-1">{pr.rationale}</p>
                      {pr.effects?.length > 0 && (
                        <div className="triz-detail-list">
                          <span>Expected effects</span>
                          {pr.effects.map((item, effectIdx) => <p key={effectIdx}>{item}</p>)}
                        </div>
                      )}
                      {pr.risks?.length > 0 && (
                        <div className="triz-detail-list warning">
                          <span>Risks</span>
                          {pr.risks.map((item, riskIdx) => <p key={riskIdx}>{item}</p>)}
                        </div>
                      )}
                      {pr.validation?.length > 0 && (
                        <div className="triz-detail-list validation">
                          <span>Validate</span>
                          {pr.validation.map((item, validationIdx) => <p key={validationIdx}>{item}</p>)}
                        </div>
                      )}
                      
                      {/* TRIZ apply button disabled - needs refactoring for new input_file architecture */}
                      <button 
                        className="triz-apply-btn mt-3 flex items-center justify-center gap-1 opacity-50 cursor-not-allowed"
                        disabled
                        title="TRIZ application needs refactoring for new architecture"
                      >
                        Apply this solution (disabled) <ArrowRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Apply & Re-run */}
            {trizStep === 4 && (
              <div className="flex flex-col gap-3 flex-1 justify-center items-center text-center">
                <span className="step-label text-success">STEP 4: SOLUTION APPLIED</span>
                <h3 className="text-primary font-medium mt-2">Model Fields Updated</h3>
                <p className="text-secondary mt-1 max-w-[240px]">
                  The chosen parameters have been updated in the Formulated Model with <b>[TRIZ edit]</b> tags.
                </p>
                <button 
                  className="triz-cta-btn mt-6"
                  onClick={onCloseTrizWizard}
                >
                  Review and Run Simulation
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .reasoning-pane {
          background-color: var(--bg-surface);
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .pane-header {
          height: 32px;
          border-bottom: 1px solid var(--border);
          padding: 0 12px;
          background-color: var(--bg-surface);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .pane-title {
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .clear-btn {
          color: var(--error);
          font-size: 11px;
        }
        .clear-btn:hover {
          text-decoration: underline;
        }
        .pane-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow-y: auto;
          transition: opacity 150ms;
        }
        .pane-body.dimmed {
          opacity: 0.3;
          pointer-events: none;
        }
        
        .messages-thread {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .empty-thread {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          text-align: center;
        }
        .welcome-example {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.5;
        }
        
        .message-row {
          display: flex;
          width: 100%;
        }
        .msg-user {
          justify-content: flex-end;
        }
        .msg-ai {
          justify-content: flex-start;
        }
        .message-content {
          max-width: 85%;
          position: relative;
          padding: 8px 12px;
          border-radius: 4px;
        }
        .message-content:hover .message-actions {
          opacity: 1;
          pointer-events: auto;
        }
        .message-actions {
          position: absolute;
          top: -12px;
          right: 4px;
          display: flex;
          gap: 2px;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 1px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.4);
          opacity: 0;
          pointer-events: none;
          transition: opacity 120ms ease;
          z-index: 10;
        }
        .action-btn {
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3px;
          border-radius: 2px;
          background: none;
        }
        .action-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-surface);
        }
        .msg-user .message-content {
          background-color: var(--bg-elevated);
        }
        .msg-ai .message-content {
          background-color: transparent;
          padding-left: 10px;
        }
        .ai-accent-bar {
          position: absolute;
          left: 0;
          top: 8px;
          bottom: 8px;
          width: 2px;
          background-color: var(--accent-primary);
        }
        .message-text {
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-primary);
        }
        .markdown-heading {
          margin: 12px 0 6px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.02em;
        }
        .markdown-heading:first-child {
          margin-top: 0;
        }
        .markdown-p {
          margin: 6px 0;
          color: var(--text-secondary);
        }
        .markdown-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin: 7px 0 9px 0;
          padding-left: 16px;
          color: var(--text-secondary);
        }
        .markdown-list li::marker {
          color: var(--accent-primary);
        }
        .markdown-table-wrap {
          overflow-x: auto;
          margin: 8px 0 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg-base);
        }
        .markdown-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .markdown-table th,
        .markdown-table td {
          padding: 7px 8px;
          text-align: left;
          border-bottom: 1px solid rgba(37, 42, 50, 0.75);
          color: var(--text-secondary);
          vertical-align: top;
        }
        .markdown-table th {
          color: var(--text-primary);
          font-weight: 700;
          background: var(--bg-elevated);
        }
        .markdown-table tr:last-child td {
          border-bottom: 0;
        }
        .inline-code,
        .math-chip {
          display: inline-block;
          padding: 1px 4px;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: var(--code-bg);
          color: var(--code-syntax);
          font-family: var(--font-mono);
          font-size: 11px;
          white-space: normal;
        }
        .display-math {
          margin: 8px 0;
          padding: 9px 10px;
          border: 1px solid rgba(59, 130, 246, 0.24);
          border-radius: 6px;
          background: rgba(59, 130, 246, 0.07);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.55;
          overflow-x: auto;
        }
        .message-text sup,
        .markdown-table sup {
          font-size: 0.72em;
          line-height: 0;
          vertical-align: super;
        }
        .typing-caret {
          display: inline-block;
          color: var(--accent-primary);
          font-weight: 600;
          margin-left: 1px;
          animation: caretBlink 700ms steps(1) infinite;
        }
        @keyframes caretBlink {
          0%, 45% { opacity: 1; }
          46%, 100% { opacity: 0; }
        }
        .message-time {
          font-size: 9px;
          color: var(--text-muted);
          display: block;
          text-align: right;
          margin-top: 4px;
        }
        
        .code-block {
          background-color: var(--code-bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 8px;
          margin: 6px 0;
          overflow-x: auto;
        }
        .code-block code {
          color: var(--code-syntax);
        }
        
        .clarification-box {
          background-color: rgba(59, 130, 246, 0.03);
          border: 1px dashed var(--border);
          border-radius: 4px;
          margin: 4px 0;
          padding: 4px;
        }
        .chip-btn {
          border: 1px solid var(--border);
          color: var(--text-secondary);
          background-color: var(--bg-surface);
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 11px;
        }
        .chip-btn:hover {
          border-color: var(--accent-primary);
          color: var(--text-primary);
        }
        
        .triz-banner {
          background-color: #1A1500;
          border-top: 1px solid var(--accent-secondary);
          border-bottom: 1px solid var(--accent-secondary);
          padding: 6px 12px;
          gap: 12px;
        }
        .triz-banner-text {
          font-size: 11px;
          color: var(--accent-secondary);
          font-weight: 500;
        }
        .triz-action-btn {
          background-color: var(--accent-secondary);
          color: #000;
          font-weight: 600;
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .triz-dismiss-btn {
          color: var(--text-secondary);
          font-size: 11px;
        }
        
        .input-area {
          border-top: 1px solid var(--border);
          padding: 10px;
          background-color: var(--bg-surface);
        }
        .input-area textarea {
          width: 100%;
          height: 54px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          color: var(--text-primary);
          padding: 8px;
          resize: none;
          outline: none;
          font-size: 13px;
          line-height: 1.5;
        }
        .input-area textarea:focus {
          border-color: var(--accent-primary);
        }
        .input-actions {
          margin-top: 6px;
        }
        .paperclip-btn {
          color: var(--text-muted);
          cursor: not-allowed;
        }
        .clarify-only-btn {
          color: var(--text-secondary);
          font-size: 12px;
          padding: 4px 8px;
        }
        .clarify-only-btn:hover {
          color: var(--text-primary);
        }
        .run-btn {
          background-color: var(--accent-primary);
          color: white;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 4px;
        }
        .run-btn:hover {
          background-color: #2563eb;
        }
        .run-btn.typing-active {
          background-color: var(--bg-elevated);
          border: 1px solid var(--accent-primary);
          color: var(--accent-primary);
        }
        .run-btn.typing-active:hover {
          background-color: var(--bg-elevated);
        }
        .run-spinner {
          animation: spin 800ms linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        /* TRIZ Guided Wizard Overlay */
        .triz-wizard-overlay {
          position: absolute;
          top: 32px;
          right: 0;
          bottom: 0;
          width: 80%;
          background-color: var(--bg-elevated);
          border-left: 1px solid var(--border);
          box-shadow: -4px 0 16px rgba(0, 0, 0, 0.5);
          z-index: 50;
        }
        .triz-wizard-header {
          height: 38px;
          border-bottom: 1px solid var(--border);
          padding: 0 12px;
        }
        .triz-header-title {
          font-weight: 600;
          color: var(--accent-secondary);
        }
        .triz-wizard-body {
          padding: 16px;
          overflow-y: auto;
        }
        .triz-steps-indicator {
          height: 3px;
        }
        .triz-step-bullet {
          height: 100%;
          background-color: var(--border);
          border-radius: 1px;
        }
        .triz-step-bullet.active {
          background-color: var(--accent-secondary);
        }
        .step-label {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .triz-box {
          background-color: #1A1500;
          border: 1px solid var(--accent-secondary);
          padding: 10px;
          border-radius: 4px;
        }
        .triz-contradiction-label {
          display: block;
          color: var(--accent-secondary);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 6px;
        }
        .triz-box p {
          color: var(--text-primary);
          line-height: 1.5;
          font-size: 13px;
        }
        .triz-signal-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .triz-signal-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 9px;
        }
        .triz-signal-card span {
          display: block;
          color: var(--text-muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .triz-signal-card strong {
          color: var(--text-primary);
          font-size: 15px;
        }
        .triz-mini-section {
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 10px;
        }
        .triz-mini-title {
          display: block;
          color: var(--text-primary);
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .triz-mini-section p {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
          margin-top: 4px;
        }
        .triz-cta-btn {
          width: 100%;
          background-color: var(--accent-secondary);
          color: #000;
          font-weight: 600;
          padding: 8px;
          border-radius: 4px;
          text-align: center;
        }
        .triz-cta-btn:hover {
          background-color: #d97706;
        }
        .triz-cta-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .triz-ghost-btn {
          width: 100%;
          color: var(--text-secondary);
          padding: 8px;
          text-align: center;
        }
        .triz-ghost-btn:hover {
          color: var(--text-primary);
        }
        .triz-option-card {
          width: 100%;
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          padding: 10px;
          text-align: left;
          border-radius: 4px;
          color: var(--text-secondary);
        }
        .triz-option-card:hover {
          border-color: var(--accent-secondary);
          color: var(--text-primary);
        }
        .triz-option-card.selected {
          border-color: var(--accent-secondary);
          background-color: #1A1500;
          color: var(--text-primary);
        }
        
        .triz-principle-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 12px;
        }
        .triz-principle-card:hover {
          border-color: var(--accent-secondary);
        }
        .principle-name {
          font-size: 10px;
          font-weight: 600;
          color: var(--accent-secondary);
          text-transform: uppercase;
        }
        .principle-fit-badge {
          color: #111827;
          background-color: var(--accent-secondary);
          border-radius: 999px;
          padding: 2px 6px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .triz-detail-list {
          margin-top: 10px;
          padding: 8px;
          border-radius: 4px;
          background-color: rgba(59, 130, 246, 0.06);
          border: 1px solid rgba(59, 130, 246, 0.18);
        }
        .triz-detail-list.warning {
          background-color: rgba(245, 158, 11, 0.07);
          border-color: rgba(245, 158, 11, 0.22);
        }
        .triz-detail-list.validation {
          background-color: rgba(34, 197, 94, 0.06);
          border-color: rgba(34, 197, 94, 0.18);
        }
        .triz-detail-list span {
          display: block;
          color: var(--text-primary);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 5px;
        }
        .triz-detail-list p {
          color: var(--text-secondary);
          font-size: 11px;
          line-height: 1.4;
          margin-top: 3px;
        }
        .triz-apply-btn {
          width: 100%;
          background: transparent;
          border: 1px solid var(--accent-secondary);
          color: var(--accent-secondary);
          font-weight: 600;
          padding: 6px;
          border-radius: 4px;
        }
        .triz-apply-btn:hover {
          background-color: var(--accent-secondary);
          color: #000;
        }
        .typing-caret {
          display: inline-block;
          width: 8px;
          height: 1.1em;
          background-color: var(--accent-primary);
          margin-left: 2px;
          animation: blink-cursor 1s steps(1, end) infinite;
          vertical-align: text-bottom;
        }
        @keyframes blink-cursor {
          0%, 49% { 
            opacity: 1; 
          }
          50%, 100% { 
            opacity: 0; 
          }
        }
      `}</style>
    </div>
  );
}