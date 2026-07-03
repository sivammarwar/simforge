import React, { useState, useRef, useEffect } from 'react';

export default function ResizableLayout({
  leftPane,
  centerPane,
  rightPane
}) {
  const containerRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(28); // percentages
  const [centerWidth, setCenterWidth] = useState(42); // percentages
  const [activeDrag, setActiveDrag] = useState(null); // 'left' | 'right' | null

  const handleMouseDown = (pane) => (e) => {
    e.preventDefault();
    setActiveDrag(pane);
  };

  useEffect(() => {
    if (!activeDrag) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const totalWidth = rect.width;
      const percentage = (mouseX / totalWidth) * 100;

      if (activeDrag === 'left') {
        // Limit left pane between 15% and 50%
        const newLeft = Math.max(15, Math.min(50, percentage));
        // Ensure center pane doesn't shrink too much
        const maxLeft = 100 - centerWidth - 15; // leaves 15% for right pane
        const finalLeft = Math.min(newLeft, maxLeft);
        setLeftWidth(finalLeft);
      } else if (activeDrag === 'right') {
        // Right drag adjusts center/right boundary
        // Boundary position is leftWidth + centerWidth
        // Limit right pane to min 15%, meaning boundary is max 85%
        // Limit center pane to min 20%, meaning boundary is min leftWidth + 20%
        const newBoundary = Math.max(leftWidth + 20, Math.min(85, percentage));
        setCenterWidth(newBoundary - leftWidth);
      }
    };

    const handleMouseUp = () => {
      setActiveDrag(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Disable text selection while dragging
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [activeDrag, leftWidth, centerWidth]);

  const rightWidth = 100 - leftWidth - centerWidth;

  return (
    <div className="resizable-container flex" ref={containerRef}>
      {/* Left Pane (Reasoning) */}
      <div 
        className="pane-wrapper flex flex-col" 
        style={{ flexBasis: `${leftWidth}%`, width: `${leftWidth}%` }}
      >
        {leftPane}
      </div>

      {/* Left Divider Handle */}
      <div 
        className={`drag-handle-h ${activeDrag === 'left' ? 'active' : ''}`}
        onMouseDown={handleMouseDown('left')}
      />

      {/* Center Pane (Model) */}
      <div 
        className="pane-wrapper flex flex-col" 
        style={{ flexBasis: `${centerWidth}%`, width: `${centerWidth}%` }}
      >
        {centerPane}
      </div>

      {/* Right Divider Handle */}
      <div 
        className={`drag-handle-h ${activeDrag === 'right' ? 'active' : ''}`}
        onMouseDown={handleMouseDown('right')}
      />

      {/* Right Pane (Results) */}
      <div 
        className="pane-wrapper flex flex-col" 
        style={{ flexBasis: `${rightWidth}%`, width: `${rightWidth}%` }}
      >
        {rightPane}
      </div>

      <style>{`
        .resizable-container {
          flex: 1;
          height: calc(100vh - 36px - 24px); /* Full height minus topbar and statusbar */
          overflow: hidden;
          background-color: var(--bg-base);
        }
        .pane-wrapper {
          min-width: 0;
          height: 100%;
          background-color: var(--bg-surface);
        }
        .drag-handle-h {
          width: 2px;
          background-color: var(--border);
          cursor: col-resize;
          transition: background-color 100ms;
          position: relative;
          z-index: 10;
          align-self: stretch;
        }
        .drag-handle-h:hover, .drag-handle-h.active {
          background-color: var(--accent-primary);
          width: 4px;
          margin-left: -1px;
          margin-right: -1px;
        }
      `}</style>
    </div>
  );
}
