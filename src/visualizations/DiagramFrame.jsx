import React from 'react';

export default function DiagramFrame({ title, subtitle, children }) {
  return (
    <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
      <div className="flex justify-between items-center mb-4">
        <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>{title}</span>
        {subtitle && <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>{subtitle}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

