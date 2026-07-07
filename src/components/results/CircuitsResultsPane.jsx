import React, { useEffect, useRef, useState } from 'react';
import { Download, Info, ZoomIn, ZoomOut, RotateCcw, Move, AlertTriangle, Wrench } from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import { exportResultsToJSON, exportMetricsToCSV, generateHTMLReport, downloadFile } from '../../services/exportService';

// Status-aware notice for the banner shown when resultsData.status !== 'completed'.
// New statuses ('out_of_scope', 'unsupported') come from the capability-gating
// step added to the circuits backend pipeline (netlist_ai.py / orchestrator.py) —
// they are NOT solver crashes, so they get their own wording instead of the
// old one-size-fits-all "ngspice failed" message.
function getStatusNotice(status) {
  switch (status) {
    case 'out_of_scope':
      return "This doesn't look like a circuits/ngspice question — see the note below for details.";
    case 'unsupported':
      return "This is a circuits question, but part (or all) of it is outside what this tool can simulate yet — see the note below.";
    case 'failed':
      return 'Simulation did not complete — the netlist was generated but ngspice failed. Check the Schematic tab for the raw netlist.';
    default:
      return 'Simulation did not complete.';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// BUGFIX: schematic label text (e.g. "V1=1 V", "R1=1 kΩ", "C1=0.159 µF")
// renders oversized and OVERLAPPING (a label from one component visually
// bleeding across the whole diagram into another component's label).
//
// ROOT CAUSE (found, not guessed):
//
// Lcapy's render path here goes LaTeX -> circuitikz -> pdflatex -> pdf2svg
// (see schematic.py). pdf2svg's SVG output commonly wraps the actual
// picture content in its OWN inner <svg> element (with its own viewBox),
// nested inside the outer <svg> we grab as `svgEl`. That inner <svg> is a
// second "viewport-establishing" element.
//
// The previous attempt at this fix computed each label's scale via
// `textEl.getCTM()`. Per the SVG spec, getCTM() only composes transforms
// up to the NEAREST viewport-establishing ancestor — i.e. for a <text>
// element living inside that inner pdf2svg <svg>, getCTM() stops AT that
// inner svg. It never includes the extra scale factor between the inner
// svg's viewBox and the outer svg's viewBox. So the computed scale for
// those elements came back systematically too SMALL (missing a
// multiplicative factor) — and since font-size is computed as
// `targetOuterUnits / innerScale`, an innerScale that's too small makes
// the resulting font-size blow up. That's exactly the giant,
// diagram-spanning label text seen overlapping unrelated components:
// it's not that the target size was tuned wrong, it's that the
// scale-cancellation factor was wrong for elements sitting inside that
// inner viewport, and how much pdf2svg nests varies per circuit (depends
// on the picture bounding box pdflatex produced), which is why it didn't
// show up uniformly on every circuit.
//
// REAL FIX: don't rely on getCTM()'s "nearest viewport" stopping behavior
// at all. Use getScreenCTM() on both the text element and the outer
// `svgEl`, and take the ratio (svgScreenCTM^-1 * textScreenCTM).
// getScreenCTM() always resolves all the way through EVERY nested
// viewport to the real screen, so this ratio gives the true accumulated
// transform from the text element's local space directly into `svgEl`'s
// own user space — correct no matter how many inner <svg> elements
// pdf2svg happens to emit for a given circuit.
// ─────────────────────────────────────────────────────────────────────────

// Target label size, expressed in the OUTER <svg>'s own viewBox units
// (i.e. after cancelling the inner per-element transform chain, but before
// the final viewBox -> 600px CSS scale). Tune this to make all labels
// bigger/smaller at once — safe to tune because it's applied uniformly,
// now that the actual per-element transform (including any nested
// pdf2svg viewport) is being cancelled out correctly.
const SCHEMATIC_LABEL_SCALE_DIVISOR = 55;

// Computes the true scale factor from `textEl`'s local user space into
// `svgEl`'s own user space, correctly accounting for any nested
// viewport-establishing elements (e.g. an inner <svg> from pdf2svg)
// sitting between them — which plain getCTM() on textEl cannot do, since
// getCTM() stops at the NEAREST viewport ancestor rather than `svgEl`.
function getScaleRelativeToSvg(textEl, svgEl) {
  try {
    const textScreenCTM = textEl.getScreenCTM();
    const svgScreenCTM = svgEl.getScreenCTM();
    if (!textScreenCTM || !svgScreenCTM) return 1;

    // Transform from textEl's local space -> svgEl's own user space,
    // regardless of how many nested viewports sit in between, because
    // getScreenCTM() always resolves all the way to the actual screen.
    const relative = svgScreenCTM.inverse().multiply(textScreenCTM);

    // Uniform scale magnitude from the 2x2 linear part of the matrix.
    const scale = Math.sqrt(relative.a * relative.a + relative.b * relative.b);
    return scale && !Number.isNaN(scale) ? scale : 1;
  } catch (e) {
    return 1;
  }
}

function applyDynamicSchematicFontSize(containerEl) {
  if (!containerEl) return;
  const svgEl = containerEl.querySelector('svg');
  if (!svgEl) return;

  // Target size in the outer SVG's own viewBox units.
  let targetOuterUnits = 1; // sane fallback if viewBox is missing/unparseable
  const viewBoxAttr = svgEl.getAttribute('viewBox');
  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    const vbWidth = parts[2];
    if (vbWidth && !Number.isNaN(vbWidth) && vbWidth > 0) {
      targetOuterUnits = vbWidth / SCHEMATIC_LABEL_SCALE_DIVISOR;
    }
  }

  svgEl.querySelectorAll('text').forEach((textEl) => {
    // Scale factor introduced by this element's own ancestor transform
    // chain, relative to `svgEl`'s coordinate system — correctly composed
    // even through a nested inner <svg> (see getScaleRelativeToSvg above).
    const innerScale = getScaleRelativeToSvg(textEl, svgEl);

    // Setting font-size in this element's LOCAL units to
    // (targetOuterUnits / innerScale) means that once the browser applies
    // this element's own transform chain, the text renders at
    // targetOuterUnits in `svgEl`'s coordinate system for every circuit
    // — regardless of what transform chain (including any nested
    // viewport) sits between this element and svgEl.
    const localFontSizePx = targetOuterUnits / innerScale;
    textEl.style.setProperty('font-size', `${localFontSizePx}px`, 'important');
    textEl.style.setProperty('fill', '#FFFFFF', 'important');
  });
}

export default function CircuitsResultsPane({
  activeDomain,
  resultsState,
  resultsData,      // standardized circuit result: metrics, time_series, frequency_response, netlist, schematic_svg, schematic_error, plain_summary, assumptions, unsupported_aspects, status
  modelData,         // inputFile (netlist + metadata) for the active session
  schematicSVG,      // sessionSchematics[activeSessionId] — set from resultsData.schematic_svg in App.jsx
  onSelectSuggestion,
  runHistory,
  hasSolverRun,
  isSimulationRunning,
}) {
  const [resultsView, setResultsView] = useState('schematic'); // 'results' | 'schematic' | 'history'
  const [activePlotTab, setActivePlotTab] = useState(null);
  const chartRef = useRef(null);
  const schematicContainerRef = useRef(null);
  console.log('[FLOW TRACE] 9/9 CircuitsResultsPane.jsx — rendering results', { hasResultsData: !!resultsData, hasSchematic: !!(schematicSVG || resultsData?.schematic_svg) });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const isOperatingPoint = !!resultsData && !resultsData.time_series && !resultsData.frequency_response;
  const isTransient = !!resultsData?.time_series;
  const isAC = !!resultsData?.frequency_response;

  const activeSchematicMarkup = schematicSVG || resultsData?.schematic_svg || null;

  // Debug: log schematic SVG prop changes
  useEffect(() => {
    console.log('[CircuitsResultsPane] schematicSVG prop:', schematicSVG ? 'present' : 'null');
    console.log('[CircuitsResultsPane] resultsData?.schematic_svg:', resultsData?.schematic_svg ? 'present' : 'null');
    console.log('[CircuitsResultsPane] current resultsView:', resultsView);
    console.log('[CircuitsResultsPane] hasSolverRun:', hasSolverRun);
    console.log('[CircuitsResultsPane] resultsData:', resultsData ? 'present' : 'null');
    console.log('[CircuitsResultsPane] resultsData?.status:', resultsData?.status);
    console.log('[CircuitsResultsPane] resultsData?.unsupported_aspects:', resultsData?.unsupported_aspects);
  }, [schematicSVG, resultsData?.schematic_svg, resultsView, hasSolverRun, resultsData]);

  // Re-apply dynamic label sizing whenever the schematic markup changes OR the
  // schematic tab becomes visible (dangerouslySetInnerHTML has committed to the
  // DOM by the time this effect runs, since it fires after render/paint).
  useEffect(() => {
    if (resultsView !== 'schematic' || !activeSchematicMarkup) return;
    // Defer one tick to guarantee the injected HTML has been committed to the DOM.
    const raf = requestAnimationFrame(() => {
      applyDynamicSchematicFontSize(schematicContainerRef.current);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeSchematicMarkup, resultsView]);

  // Build the plot configs directly from the standardized backend fields.
  const getPlotConfigs = () => {
    if (isTransient) {
      const { t, ...series } = resultsData.time_series;
      const traces = Object.entries(series).map(([name, values]) => ({
        x: t, y: values, type: 'scatter', mode: 'lines', name,
      }));
      return [{
        id: 'transient',
        title: 'Time Domain',
        traces,
        layout: {
          xaxis: { title: 'Time (s)', color: '#8C929E', gridcolor: '#1C2026' },
          yaxis: { title: 'Voltage (V)', color: '#8C929E', gridcolor: '#1C2026' },
          paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
          font: { color: '#8C929E', size: 10 }, margin: { t: 20, r: 20, b: 40, l: 50 },
          legend: { orientation: 'h', y: -0.25 },
        },
      }];
    }
    if (isAC) {
      const { freq, mag, phase } = resultsData.frequency_response;
      return [
        {
          id: 'mag', title: 'Magnitude',
          traces: [{ x: freq, y: mag, type: 'scatter', mode: 'lines', name: 'Magnitude (dB)', line: { color: '#3B82F6' } }],
          layout: {
            xaxis: { title: 'Frequency (Hz)', type: 'log', color: '#8C929E', gridcolor: '#1C2026' },
            yaxis: { title: 'Magnitude (dB)', color: '#8C929E', gridcolor: '#1C2026' },
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            font: { color: '#8C929E', size: 10 }, margin: { t: 20, r: 20, b: 40, l: 50 },
          },
        },
        {
          id: 'phase', title: 'Phase',
          traces: [{ x: freq, y: phase, type: 'scatter', mode: 'lines', name: 'Phase (deg)', line: { color: '#F59E0B' } }],
          layout: {
            xaxis: { title: 'Frequency (Hz)', type: 'log', color: '#8C929E', gridcolor: '#1C2026' },
            yaxis: { title: 'Phase (deg)', color: '#8C929E', gridcolor: '#1C2026' },
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            font: { color: '#8C929E', size: 10 }, margin: { t: 20, r: 20, b: 40, l: 50 },
          },
        },
      ];
    }
    // Pole-zero plot for symbolic analysis results
    if (resultsData?.metrics && !isTransient && !isAC) {
      const polesMetric = resultsData.metrics.find(m => m.name === 'Poles (numeric)' || m.name === 'Poles');
      const zerosMetric = resultsData.metrics.find(m => m.name === 'Zeros (numeric)' || m.name === 'Zeros');
      if (polesMetric || zerosMetric) {
        const parseComplexList = (val) => {
          if (!val) return [];
          try {
            const str = typeof val === 'string' ? val : JSON.stringify(val);
            const cleaned = str.replace(/[\[\]']/g, '').trim();
            if (!cleaned) return [];
            return cleaned.split(',').map(s => {
              const num = parseFloat(s.trim());
              return isNaN(num) ? null : num;
            }).filter(v => v !== null);
          } catch { return []; }
        };
        const poles = parseComplexList(polesMetric?.value);
        const zeros = parseComplexList(zerosMetric?.value);
        if (poles.length || zeros.length) {
          const traces = [];
          if (poles.length) {
            traces.push({
              x: poles, y: new Array(poles.length).fill(0),
              type: 'scatter', mode: 'markers',
              name: 'Poles', marker: { symbol: 'x', size: 12, color: '#EF4444' },
            });
          }
          if (zeros.length) {
            traces.push({
              x: zeros, y: new Array(zeros.length).fill(0),
              type: 'scatter', mode: 'markers',
              name: 'Zeros', marker: { symbol: 'circle', size: 10, color: '#3B82F6' },
            });
          }
          return [{
            id: 'polezero', title: 'Pole-Zero Plot',
            traces,
            layout: {
              xaxis: { title: 'Real', color: '#8C929E', gridcolor: '#1C2026', zeroline: true, zerolinewidth: 1 },
              yaxis: { title: 'Imaginary', color: '#8C929E', gridcolor: '#1C2026', zeroline: true, zerolinewidth: 1 },
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#8C929E', size: 10 }, margin: { t: 20, r: 20, b: 40, l: 50 },
              legend: { orientation: 'h', y: -0.2 },
            },
          }];
        }
      }
    }
    return [];
  };

  const plotConfigs = getPlotConfigs();

  useEffect(() => {
    console.log('[CircuitsResultsPane] Plot configs:', plotConfigs);
    console.log('[CircuitsResultsPane] Active plot tab:', activePlotTab);
    if (!plotConfigs.length) return;
    if (!activePlotTab || !plotConfigs.find(p => p.id === activePlotTab)) {
      console.log('[CircuitsResultsPane] Setting active plot tab to:', plotConfigs[0].id);
      setActivePlotTab(plotConfigs[0].id);
    }
  }, [resultsData]);

  // Set active plot tab when switching to results view
  useEffect(() => {
    console.log('[CircuitsResultsPane] View switch effect - resultsView:', resultsView, 'plotConfigs.length:', plotConfigs.length, 'activePlotTab:', activePlotTab);
    if (resultsView === 'results' && plotConfigs.length > 0 && (!activePlotTab || !plotConfigs.find(p => p.id === activePlotTab))) {
      console.log('[CircuitsResultsPane] Setting active plot tab to:', plotConfigs[0].id);
      setActivePlotTab(plotConfigs[0].id);
    }
  }, [resultsView, plotConfigs, activePlotTab]);

  useEffect(() => {
    console.log('[CircuitsResultsPane] Plotly render effect - chartRef.current:', !!chartRef.current, 'plotConfigs.length:', plotConfigs.length, 'activePlotTab:', activePlotTab, 'resultsView:', resultsView);
    if (resultsView !== 'results' || !chartRef.current || !plotConfigs.length) return;
    const plot = plotConfigs.find(p => p.id === activePlotTab) || plotConfigs[0];
    console.log('[CircuitsResultsPane] Rendering plot:', plot.id);
    Plotly.newPlot(chartRef.current, plot.traces, plot.layout, {
      displayModeBar: true, displaylogo: false,
      modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
      responsive: true,
    });
    return () => { if (chartRef.current) Plotly.purge(chartRef.current); };
  }, [activePlotTab, resultsView, plotConfigs]);

  const clampZoom = (v) => Math.min(2.5, Math.max(0.5, v));
  const onWheel = (e) => {
    e.preventDefault();
    setZoom(z => clampZoom(Number((z + (e.deltaY > 0 ? -0.08 : 0.08)).toFixed(2))));
  };
  
  // Ref for schematic viewport to attach passive event listener
  const schematicViewportRef = useRef(null);
  
  useEffect(() => {
    const viewport = schematicViewportRef.current;
    if (!viewport) return;
    
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel, { passive: false });
    };
  }, [onWheel]);
  const onPointerDown = (e) => {
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!isPanning) return;
    const s = panStart.current;
    setPan({ x: s.panX + e.clientX - s.x, y: s.panY + e.clientY - s.y });
  };
  const onPointerUp = (e) => {
    setIsPanning(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const handleExportJSON = () => resultsData && downloadFile(
    exportResultsToJSON(resultsData, modelData, 'Circuits'),
    `simforge_circuit_${Date.now()}.json`, 'application/json'
  );
  const handleExportCSV = () => resultsData && downloadFile(
    exportMetricsToCSV(resultsData), `simforge_circuit_metrics_${Date.now()}.csv`, 'text/csv'
  );
  const handleExportHTML = () => resultsData && downloadFile(
    generateHTMLReport(resultsData, modelData, 'Circuits'), `simforge_circuit_report_${Date.now()}.html`, 'text/html'
  );

  const suggestions = [
    { label: 'Sweep component value', prompt: 'Sweep the main resistor/capacitor value and compare the effect on output' },
    { label: 'Add a load', prompt: 'Add a realistic load to this circuit and recalculate' },
    { label: 'Explain the result', prompt: 'Explain in plain terms what this circuit result means' },
  ];

  const handleTabClick = (v) => {
    console.log('[CircuitsResultsPane] Tab clicked:', v, 'current view:', resultsView);
    setResultsView(v);
  };

  return (
    <div className="results-pane flex flex-col flex-1 relative">
      <div className="pane-header flex items-center justify-between">
        <div className="flex gap-3">
          {['results', 'schematic', 'history'].map(v => (
            (v !== 'history' || (runHistory && runHistory.length > 0)) && (
              <button key={v} className={`pane-tab ${resultsView === v ? 'active' : ''}`} onClick={() => handleTabClick(v)}>
                {v}
              </button>
            )
          ))}
        </div>
        {resultsState === 'results' && (
          <div className="flex items-center gap-2">
            <button className="header-btn" onClick={handleExportJSON}><Download size={12} /> JSON</button>
            <button className="header-btn" onClick={handleExportCSV}><Download size={12} /> CSV</button>
            <button className="header-btn" onClick={handleExportHTML}><Download size={12} /> Report</button>
          </div>
        )}
      </div>

      <div className="pane-body flex-1 flex flex-col overflow-y-auto">
        {!hasSolverRun && resultsView !== 'schematic' && (
          <div className="empty-state flex flex-col items-center justify-center flex-1">
            {isSimulationRunning ? (
              <><div className="plot-spinner" /><span className="empty-state-text mt-3">Generating netlist and running ngspice…</span></>
            ) : (
              <span className="empty-state-text">Ask a circuits question to get started.</span>
            )}
          </div>
        )}

        {resultsView === 'schematic' && (
          <div className="schematic-stage">
            <div className="schematic-toolbar">
              <span className="schematic-toolbar-label"><Move size={12} /> Drag to pan · Wheel to zoom</span>
              <div className="schematic-toolbar-actions">
                <button onClick={() => setZoom(z => clampZoom(z - 0.15))}><ZoomOut size={13} /></button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => clampZoom(z + 0.15))}><ZoomIn size={13} /></button>
                <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw size={13} /></button>
              </div>
            </div>
            <div
              ref={schematicViewportRef}
              className={`schematic-viewport ${isPanning ? 'panning' : ''}`}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
            >
              <div className="schematic-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                {activeSchematicMarkup ? (
                  <div
                    ref={schematicContainerRef}
                    dangerouslySetInnerHTML={{ __html: activeSchematicMarkup }}
                    className="schematic-svg-container"
                  />
                ) : resultsData?.status === 'out_of_scope' || resultsData?.status === 'unsupported' ? (
                  <div className="schematic-error-box">
                    <Wrench size={16} />
                    <span>{resultsData.plain_summary}</span>
                  </div>
                ) : resultsData?.schematic_error ? (
                  <div className="schematic-error-box">
                    <AlertTriangle size={16} className="text-danger" />
                    <span>Schematic render failed: {resultsData.schematic_error}</span>
                    {modelData?.content && <pre className="netlist-fallback">{modelData.content}</pre>}
                  </div>
                ) : modelData?.content ? (
                  <pre className="netlist-fallback">{modelData.content}</pre>
                ) : (
                  <span className="empty-state-text">No circuit generated yet.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {resultsView === 'results' && hasSolverRun && resultsData && (
          <div className="results-content flex-1 flex flex-col p-3">
            <div className="summary-box flex items-start gap-2 mb-3">
              <Info size={14} className="text-success mt-0.5" />
              <div>
                <p className="summary-text">{resultsData.plain_summary}</p>
                <span className="summary-meta">
                  ({resultsData.solver_name || 'ngspice'} · {resultsData.system_type})
                </span>
              </div>
            </div>

            {resultsData.status !== 'completed' && (
              <div className="schematic-error-box mb-3">
                <AlertTriangle size={14} className="text-danger" />
                <span>{getStatusNotice(resultsData.status)}</span>
              </div>
            )}

            {plotConfigs.length > 0 && (
              <>
                {plotConfigs.length > 1 && (
                  <div className="sub-tabs flex gap-2 mb-2">
                    {plotConfigs.map(p => (
                      <button key={p.id} className={`sub-tab-btn ${activePlotTab === p.id ? 'active' : ''}`} onClick={() => setActivePlotTab(p.id)}>
                        {p.title}
                      </button>
                    ))}
                  </div>
                )}
                <div className="chart-view-area mb-3">
                  <div ref={chartRef} style={{ width: '100%', height: 240 }} />
                </div>
              </>
            )}

            {isOperatingPoint && resultsData.status === 'completed' && (
              <div className="static-plot-wrap mb-3">
                <div className="plot-status-note">
                  This is a DC operating-point result — no time or frequency sweep was run, so metrics below are the full result.
                </div>
              </div>
            )}

            {resultsData.metrics?.length > 0 && (
              <div className="metrics-section">
                <span className="section-label">KEY METRICS</span>
                <div className="divider-line" />
                <div className="metrics-grid">
                  {resultsData.metrics?.filter(m => m.name !== 'Run duration').map(m => (
                    <div key={m.name} className="metric-row flex justify-between items-center">
                      <span className="metric-name">{m.name}</span>
                      <span className="metric-value">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultsData.assumptions?.length > 0 && (
              <div className="metrics-section mt-3">
                <span className="section-label">ASSUMPTIONS</span>
                <div className="divider-line" />
                <ul className="assumptions-list">
                  {resultsData.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            {resultsData.unsupported_aspects?.length > 0 && (
              <div className="metrics-section mt-3">
                <span className="section-label section-label-warning">STILL WORKING ON</span>
                <div className="divider-line" />
                <ul className="assumptions-list unsupported-list">
                  {resultsData.unsupported_aspects.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            <div className="suggestions-section mt-4">
              <span className="section-label">TRY NEXT</span>
              <div className="divider-line" />
              <div className="chips-container flex gap-2 flex-wrap mt-2">
                {suggestions.map(s => (
                  <button key={s.label} className="chip-btn" onClick={() => onSelectSuggestion(s.prompt)}>{s.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {resultsView === 'history' && runHistory && (
          <div className="history-tab-content p-3 flex flex-col gap-2">
            {runHistory.map((run, idx) => (
              <div key={idx} className="history-run-card flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="run-card-time">{run.timestamp}</span>
                  <span className="run-card-desc truncate">{run.description}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .results-pane { background-color: var(--bg-surface); height: 100%; display: flex; flex-direction: column; min-height: 0; }
        .pane-body { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
        .pane-tab { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); padding: 8px 0; margin-right: 16px; }
        .pane-tab.active { color: var(--text-primary); border-bottom: 2px solid var(--accent-primary); }
        .header-btn { font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; border: 1px solid var(--border); padding: 2px 8px; border-radius: 4px; }
        .empty-state { text-align: center; padding: 24px; }
        .empty-state-text { font-size: 12px; color: var(--text-muted); }
        .summary-box { background: #0D1117; border-left: 3px solid var(--success); padding: 8px 12px; border-radius: 0 4px 4px 0; }
        .summary-text { font-size: 13px; color: var(--text-primary); }
        .summary-meta { font-size: 10px; color: var(--text-muted); margin-top: 4px; display: block; }
        .schematic-error-box { display: flex; align-items: flex-start; gap: 8px; border: 1px solid rgba(239,68,68,.35); background: rgba(239,68,68,.06); border-radius: 6px; padding: 10px; color: var(--text-secondary); font-size: 12px; }
        .netlist-fallback { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); background: #0D0F12; border: 1px solid var(--border); border-radius: 6px; padding: 12px; white-space: pre-wrap; max-width: 400px; }
        .schematic-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #0D0F12; }
        .schematic-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--border); background: var(--bg-surface); }
        .schematic-toolbar-label { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 11px; }
        .schematic-toolbar-actions { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px; }
        .schematic-toolbar-actions button { width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 4px; display: flex; align-items: center; justify-content: center; background: var(--bg-base); }
        .schematic-viewport { flex: 1; min-height: 360px; overflow: hidden; cursor: grab; touch-action: none; display: flex; align-items: center; justify-content: center; background: #0D0F12; }
        .schematic-viewport.panning { cursor: grabbing; }
        .schematic-canvas { transform-origin: center center; transition: transform 80ms ease-out; display: flex; align-items: center; justify-content: center; }
        .chart-view-area { min-height: 240px; background: #0D0F12; border-radius: 4px; border: 1px solid rgba(37,42,50,.75); }
        .sub-tabs { border-bottom: 1px solid var(--border); }
        .sub-tab-btn { font-size: 11px; color: var(--text-secondary); padding: 4px 8px; }
        .sub-tab-btn.active { color: var(--accent-primary); font-weight: 500; }
        .section-label { font-size: 10px; font-weight: 600; letter-spacing: .08em; color: var(--text-muted); }
        .section-label-warning { color: #F59E0B; }
        .metrics-grid { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
        .metric-row { font-size: 13px; }
        .metric-name { color: var(--text-secondary); }
        .metric-value { color: var(--text-primary); font-weight: 500; }
        .assumptions-list { font-size: 12px; color: var(--text-secondary); padding-left: 16px; margin-top: 6px; }
        .unsupported-list li::marker { color: #F59E0B; }
        .chip-btn { border: 1px solid var(--border); color: var(--text-secondary); border-radius: 4px; padding: 4px 10px; font-size: 11px; }
        .chip-btn:hover { border-color: var(--accent-primary); color: var(--text-primary); }
        .history-run-card { background: var(--bg-surface); border: 1px solid var(--border); padding: 10px; border-radius: 4px; }
        .run-card-time { font-size: 10px; color: var(--text-muted); }
        .run-card-desc { font-size: 12px; color: var(--text-primary); margin-top: 2px; }
        .plot-spinner { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(59,130,246,.18); border-top-color: var(--accent-primary); animation: spin .85s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .schematic-svg-container svg { stroke: #FFFFFF !important; fill: none !important; width: 600px !important; height: auto !important; }
        .schematic-svg-container svg path { stroke: #FFFFFF !important; fill: none !important; }
        .schematic-svg-container svg g[fill="rgb(0%, 0%, 0%)"] { fill: #FFFFFF !important; }
        /* Fallback only — actual size is set dynamically in JS (applyDynamicSchematicFontSize),
           which cancels out each text element's true accumulated transform into svgEl's own
           coordinate system (computed via getScaleRelativeToSvg, robust to any nested inner
           <svg> viewport pdf2svg may emit), since a fixed number here can't compensate for a
           per-element, per-circuit transform. */
        .schematic-svg-container svg text { fill: #FFFFFF !important; }
      `}</style>
    </div>
  );
}