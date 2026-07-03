import React from 'react';

export default function DiagramFallback({ capability }) {
  const message = capability?.diagram_message || {};
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-[#0D0F12] border border-[#252A32] rounded-lg m-2" style={{ minHeight: 260 }}>
      <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>
        {message.title || 'Diagram coming soon'}
      </span>
      <span className="mt-2 text-[11px] max-w-[360px]" style={{ color: 'var(--text-secondary)' }}>
        {message.message || 'The calculation is complete, but this diagram template is not ready yet.'}
      </span>
      <span className="mt-3 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
        Status: {capability?.status || 'not_started'} · Renderer: {capability?.renderer || 'none'}
      </span>
    </div>
  );
}

