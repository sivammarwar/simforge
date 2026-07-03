import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, Award, Info, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Move, Settings, Play, Pause, BarChart3 } from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import { parseUnit } from '../../services/solvers';
import { getPlots } from '../../services/plotEngine';
import { exportResultsToJSON, exportMetricsToCSV, generateHTMLReport, downloadFile } from '../../services/exportService';
import { startTuningLoop, stopTuningLoop, isTuningActive, getTuningState, processTuningIteration, generateTuningReport } from '../../services/liveTuningLoop';
import { createComparison, getActiveComparison, getAllComparisons, generateComparisonSummary } from '../../services/realtimeComparison';

export default function ResultsPane({
  activeDomain,
  resultsState, // 'empty' | 'results'
  modelState,
  resultsData,  // parsed solver output data
  schematicSVG, // SVG string from brain or template
  svgPlots,     // Array of SVG plot strings from brain
  onSelectSuggestion, // callback for "What's next?" chips
  runHistory,  // array of past runs
  onCompareRun,  // compare active run with historical run
  livePlaygroundActive,
  modelData,
  hasSolverRun, // NEW: boolean indicating if solver has been executed
  isSimulationRunning, // NEW: boolean indicating if simulation is currently running
  onCreateComparison // NEW: callback for creating result comparison
}) {
  const [activeTab, setActiveTab] = useState('Time Domain'); // 'Time Domain' | 'Frequency Domain'
  const [resultsView, setResultsView] = useState('results'); // 'results' | 'history' | 'compare'
  const [selectedHistoricalRun, setSelectedHistoricalRun] = useState(null);
  const [plotStatus, setPlotStatus] = useState('idle');
  const [plotConfigs, setPlotConfigs] = useState([]);
  const [currentPlot, setCurrentPlot] = useState(null);
  const [schematicZoom, setSchematicZoom] = useState(1);
  const [schematicPan, setSchematicPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  
  // Tuning state
  const [tuningActive, setTuningActive] = useState(false);
  const [tuningState, setTuningState] = useState(null);
  const [tuningTargetMetric, setTuningTargetMetric] = useState('');
  const [tuningDirection, setTuningDirection] = useState('maximize');
  
  // Comparison state
  const [comparisons, setComparisons] = useState([]);
  const [activeComparison, setActiveComparison] = useState(null);
  
  const isStaticCircuit = activeDomain === 'Circuits' && resultsData?.visualization_type === 'circuit_static';
  const isPlotLoading = modelState === 'formulating' || modelState === 'running';

  useEffect(() => {
    if (activeDomain === 'Circuits') {
      setActiveTab('Time Domain');
    } else if (activeDomain === 'Aerospace') {
      setActiveTab(resultsData?.wing_profile ? 'Lift Distribution' : 'Mach Number');
    } else if ((activeDomain === 'Structural' || activeDomain === 'Physics') && resultsData?.spring_profile) {
      setActiveTab('Displacement');
    } else if (activeDomain === 'Physics' && resultsData?.wave_profile) {
      setActiveTab('Wave Profile');
    } else {
      setActiveTab('');
    }
  }, [activeDomain, resultsData?.visualization_type, resultsData?.spring_profile, resultsData?.wave_profile]);

  const chartRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (modelData) {
      setResultsView('schematic');
      setSchematicZoom(1);
      setSchematicPan({ x: 0, y: 0 });
    }
  }, [modelData?.SYSTEM_TYPE, activeDomain]);

  const getNoPlotMessage = () => {
    if (resultsData?.visualization_type === 'circuit_static') {
      return 'No waveform plot was generated for this DC operating-point result. The static circuit result is shown instead.';
    }
    if (resultsData?.spring_profile) {
      return 'Spring-pulley SHM plots are available for displacement, velocity, and acceleration.';
    }
    if (resultsData?.wave_profile) {
      return 'Wave-profile data is available and plotted. A richer system diagram is still in development.';
    }
    if (activeDomain === 'Physics' && resultsData?.visualization_capability?.diagram_status !== 'fully_rendered') {
      return resultsData.visualization_capability?.diagram_message?.message || 'The physics calculation is complete, but this diagram template is not ready yet.';
    }
    if (String(modelData?.SYSTEM_TYPE || '').toLowerCase().includes('pulley')) {
      return 'This run is an analytical pulley dynamics calculation. No contour or time-series plot was generated; use the schematic tab for the free-body diagram.';
    }
    if (!resultsData) return 'No result data is available yet.';
    if (activeDomain === 'Structural' || activeDomain === 'Fluids') {
      return 'No field-map data was generated for this run, so there is no contour plot to display.';
    }
    return 'No plot dataset was generated for the selected result/tab.';
  };

  // Render 3D contour field from backend (e.g., CalculiX stress, OpenFOAM pressure)
  const render3DContour = (canvas, ctx, width, height, contourField) => {
    const { x, y, z, stress, displacement } = contourField;
    const scalarField = stress || displacement;
    
    if (!scalarField || scalarField.length === 0) {
      return;
    }

    // Calculate bounds
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    const yMin = Math.min(...y);
    const yMax = Math.max(...y);
    const zMin = Math.min(...z);
    const zMax = Math.max(...z);
    const scalarMin = Math.min(...scalarField);
    const scalarMax = Math.max(...scalarField);

    // Color mapping function
    const getColorForVal = (val) => {
      const ratio = (val - scalarMin) / (scalarMax - scalarMin || 1);
      const hue = 240 - ratio * 240;
      return `hsl(${hue}, 85%, 45%)`;
    };

    // Clear canvas
    ctx.fillStyle = '#0D0F12';
    ctx.fillRect(0, 0, width, height);

    // Scale factors
    const padding = 40;
    const plotWidth = width - padding * 2 - 60; // Extra space for legend
    const plotHeight = height - padding * 2;
    const scaleX = plotWidth / (xMax - xMin || 1);
    const scaleY = plotHeight / (yMax - yMin || 1);

    // Draw 3D mesh as 2D projection (top-down view with color-coded scalar)
    for (let i = 0; i < x.length; i++) {
      const screenX = padding + (x[i] - xMin) * scaleX;
      const screenY = height - padding - (y[i] - yMin) * scaleY;
      
      const val = scalarField[i];
      ctx.fillStyle = getColorForVal(val);
      
      // Draw point as small rectangle
      const pointSize = 4;
      ctx.fillRect(screenX - pointSize/2, screenY - pointSize/2, pointSize, pointSize);
    }

    // Draw color bar legend
    const legX = width - 50;
    const legYStart = padding;
    const legHeight = plotHeight;
    const legWidth = 12;

    for (let i = 0; i < legHeight; i++) {
      const ratio = i / legHeight;
      const val = scalarMax - ratio * (scalarMax - scalarMin);
      ctx.fillStyle = getColorForVal(val);
      ctx.fillRect(legX, legYStart + i, legWidth, 1);
    }

    ctx.strokeStyle = '#252A32';
    ctx.lineWidth = 1;
    ctx.strokeRect(legX, legYStart, legWidth, legHeight);

    // Legend labels
    ctx.fillStyle = '#8C929E';
    ctx.font = '9px JetBrains Mono';
    ctx.fillText(`${scalarMax.toExponential(2)}`, legX - 35, legYStart + 5);
    ctx.fillText(`${scalarMin.toExponential(2)}`, legX - 35, legYStart + legHeight);
    ctx.fillText(stress ? 'Stress (Pa)' : 'Disp (m)', legX - 30, legYStart - 8);

    // Axis labels
    ctx.fillStyle = '#8C929E';
    ctx.fillText('X', padding + plotWidth / 2, height - 10);
    ctx.fillText('Y', 10, height / 2);
  };

  useEffect(() => {
    if (isPlotLoading) {
      setPlotStatus('loading');
    }
  }, [isPlotLoading]);

  // Unified Plotly handling using plotEngine
  useEffect(() => {
    if (isPlotLoading) return;
    if (!hasSolverRun) return; // NEW: Only render plots after solver has run
    if (resultsState !== 'results' || !resultsData) {
      setPlotStatus('idle');
      return;
    }

    // Obtain plot configurations
    const plots = getPlots(resultsData, activeDomain, modelData);
    if (!plots || plots.length === 0) {
      if (chartRef.current) {
        Plotly.purge(chartRef.current);
      }
      setPlotStatus('no-plot');
      return;
    }
    if (!chartRef.current) {
      setPlotStatus('no-plot');
      return;
    }
    setPlotConfigs(plots);
    
    // Set active plot based on activeTab or default to first plot
    const activePlot = plots.find(p => p.title === activeTab) || plots[0];
    setCurrentPlot(activePlot);
    setPlotStatus('ready');

    // Render the active plot
    Plotly.newPlot(
      chartRef.current,
      activePlot.traces,
      activePlot.layout,
      {
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
        responsive: true,
      }
    ).catch(() => setPlotStatus('no-plot'));
  }, [resultsState, resultsData, activeDomain, activeTab, isPlotLoading, getPlots, hasSolverRun]);

  // 2D Field & CFD Canvas Renderer
  useEffect(() => {
    if (isPlotLoading) return;
    if (!hasSolverRun) return; // NEW: Only render plots after solver has run
    if (resultsState !== 'results' || !resultsData) return;
    if (activeDomain === 'Circuits' || activeDomain === 'Semiconductors' || activeDomain === 'Aerospace') return;
    if (!canvasRef.current) return;
    setPlotStatus('loading');

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Check for backend contour_field data (3D mesh results)
    const contourField = resultsData.contour_field;
    if (contourField && contourField.x && contourField.y && contourField.z) {
      render3DContour(canvas, ctx, width, height, contourField);
      setPlotStatus('ready');
      return;
    }

    const field = resultsData.field;
    if (!field) {
      setPlotStatus('no-plot');
      return;
    }

    const { nx, ny, coords, scalar, minScalar, maxScalar } = field;

    // Get color from scalar range (Blue [low] -> Green -> Red [high])
    // Map scalar to hue: 240 (blue) down to 0 (red)
    const getColorForVal = (val) => {
      const ratio = (val - minScalar) / (maxScalar - minScalar || 1);
      const hue = 240 - ratio * 240;
      return `hsl(${hue}, 85%, 45%)`;
    };

    // Particles/streamlines for CFD
    const particles = [];
    const numParticles = 80;
    if (resultsData.fluid_flow) {
      for (let i = 0; i < numParticles; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * (height - 30) + 15,
          speed: Math.random() * 2 + 1,
          size: Math.random() * 1.5 + 0.5
        });
      }
    }

    const render = () => {
      ctx.fillStyle = '#0D0F12';
      ctx.fillRect(0, 0, width, height);

      // Scale coordinates to fit canvas
      const scaleX = (width - 40) / (nx - 1);
      const scaleY = (height - 40) / (ny - 1);
      const offsetX = 20;
      const offsetY = 20;

      // Draw Grid / Quad Mesh cells filled with mapped scalar values
      for (let ix = 0; ix < nx - 1; ix++) {
        for (let iy = 0; iy < ny - 1; iy++) {
          const idx0 = ix * ny + iy;
          const idx1 = (ix + 1) * ny + iy;
          const idx2 = (ix + 1) * ny + (iy + 1);
          const idx3 = ix * ny + (iy + 1);

          const c0 = coords[idx0];
          const c1 = coords[idx1];
          const c2 = coords[idx2];
          const c3 = coords[idx3];

          // Deflection scales
          const visualDeflect = activeDomain === 'Structural' ? 40 : 1;

          // Scaled canvas screen points
          const screenX0 = offsetX + ix * scaleX;
          const screenY0 = height / 2 + (c0[1] - (activeDomain === 'Structural' ? c0[0] * 0 : 0)) * scaleY * visualDeflect;
          
          const screenX1 = offsetX + (ix + 1) * scaleX;
          const screenY1 = height / 2 + (c1[1] - (activeDomain === 'Structural' ? c1[0] * 0 : 0)) * scaleY * visualDeflect;
          
          const screenX2 = offsetX + (ix + 1) * scaleX;
          const screenY2 = height / 2 + (c2[1] - (activeDomain === 'Structural' ? c2[0] * 0 : 0)) * scaleY * visualDeflect;
          
          const screenX3 = offsetX + ix * scaleX;
          const screenY3 = height / 2 + (c3[1] - (activeDomain === 'Structural' ? c3[0] * 0 : 0)) * scaleY * visualDeflect;

          // Average scalar for the cell
          const sVal = (scalar[idx0] + scalar[idx1] + scalar[idx2] + scalar[idx3]) / 4;

          ctx.beginPath();
          ctx.moveTo(screenX0, screenY0);
          ctx.lineTo(screenX1, screenY1);
          ctx.lineTo(screenX2, screenY2);
          ctx.lineTo(screenX3, screenY3);
          ctx.closePath();

          ctx.fillStyle = getColorForVal(sVal);
          ctx.fill();

          // Mesh grid lines
          ctx.lineWidth = 0.5;
          ctx.strokeStyle = 'rgba(37, 42, 50, 0.2)';
          ctx.stroke();
        }
      }

      // Draw boundary line clamps for Structural FEA
      if (activeDomain === 'Structural') {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(5, 10, 15, height - 20); // fixed wall block
        ctx.strokeStyle = '#4B5260';
        ctx.lineWidth = 2;
        ctx.strokeRect(5, 10, 15, height - 20);
        
        ctx.fillStyle = '#E8EAF0';
        ctx.font = '9px JetBrains Mono';
        ctx.fillText('FIXED', 6, height / 2 - 10);
      }

      // Render & Animate dynamic streamlines for Fluids CFD
      if (resultsData.fluid_flow) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        particles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();

          // Move particles along pipe
          p.x += p.speed;
          if (p.x > width - 10) {
            p.x = 20;
            p.y = Math.random() * (height - 30) + 15;
          }
        });
      }

      // Color Bar Legend (Vertical on the right)
      const legX = width - 40;
      const legYStart = 30;
      const legHeight = height - 60;
      const legWidth = 10;

      // Draw color bar gradient
      for (let i = 0; i < legHeight; i++) {
        const ratio = i / legHeight;
        const val = maxScalar - ratio * (maxScalar - minScalar);
        ctx.fillStyle = getColorForVal(val);
        ctx.fillRect(legX, legYStart + i, legWidth, 1);
      }

      // Legend border
      ctx.strokeStyle = '#252A32';
      ctx.lineWidth = 1;
      ctx.strokeRect(legX, legYStart, legWidth, legHeight);

      // Legend labels
      ctx.fillStyle = '#8C929E';
      ctx.font = '9px JetBrains Mono';
      ctx.fillText(`${maxScalar.toFixed(0)}`, legX - 25, legYStart + 5);
      ctx.fillText(`${minScalar.toFixed(0)}`, legX - 20, legYStart + legHeight);
      ctx.fillText(`${field.unit}`, legX - 20, legYStart - 8);

      if (resultsData.fluid_flow) {
        animationRef.current = requestAnimationFrame(render);
      }
    };

    render();
    setPlotStatus('ready');

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [resultsState, resultsData, activeDomain, isPlotLoading]);

  const renderDomainSchematic = () => {
    // Tier 3: Use brain-generated SVG if available
    if (schematicSVG) {
      return (
        <div 
          className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2"
          dangerouslySetInnerHTML={{ __html: schematicSVG }}
          style={{ width: '100%', maxWidth: '400px' }}
        />
      );
    }

    if (!modelData) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-muted" style={{ height: '300px' }}>
          No formulation parameters loaded. Formulate a model to visualize.
        </div>
      );
    }

    if (activeDomain === 'Circuits' && modelData.SYSTEM_TYPE === 'Voltage Divider') {
      const vin = modelData.INPUT?.['Supply voltage']?.value || modelData.INPUT?.['Input voltage']?.value || '12 V';
      const target = modelData.OUTPUT?.['Target voltage']?.value || '5 V';
      const r1 = modelData.COMPONENTS?.['Top resistor (R1)']?.value || '1.5 kΩ';
      const r2 = modelData.COMPONENTS?.['Bottom resistor (R2)']?.value || '1 kΩ';
      const voutMetric = resultsData?.metrics?.find(m => m.name === 'Output voltage')?.value || target;
      const currentMetric = resultsData?.metrics?.find(m => m.name === 'Divider current')?.value || '4.80 mA';

      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>VOLTAGE DIVIDER SCHEMATIC</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>DC operating-point circuit</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="230" viewBox="0 0 400 240" fill="none">
              <defs>
                <pattern id="dividerGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#161A22" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="400" height="240" fill="url(#dividerGrid)" />

              {/* Input and output nodes */}
              <circle cx="90" cy="42" r="4" fill="#3B82F6" />
              <circle cx="250" cy="112" r="4" fill="#22C55E" />
              <text x="42" y="46" fill="var(--accent-primary)" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)">Vin {vin}</text>
              <text x="265" y="116" fill="var(--success)" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)">Vout {voutMetric}</text>
              <text x="265" y="130" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">Target {target}</text>

              {/* Wires */}
              <path d="M 90 46 L 90 64" stroke="#8C929E" strokeWidth="2" />
              <path d="M 90 160 L 90 190" stroke="#8C929E" strokeWidth="2" />
              <path d="M 90 112 L 250 112" stroke="#8C929E" strokeWidth="2" />

              {/* R1 resistor vertical zigzag */}
              <path d="M 90 64 L 80 72 L 100 82 L 80 92 L 100 102 L 80 112 L 90 120" stroke="#F59E0B" strokeWidth="2.3" fill="none" />
              <text x="110" y="92" fill="var(--accent-secondary)" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)">R1 {r1}</text>
              <text x="110" y="105" fill="var(--text-muted)" fontSize="8">Top resistor</text>

              {/* R2 resistor vertical zigzag */}
              <path d="M 90 120 L 80 128 L 100 138 L 80 148 L 100 158 L 80 168 L 90 176" stroke="#3B82F6" strokeWidth="2.3" fill="none" />
              <text x="110" y="150" fill="var(--accent-primary)" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)">R2 {r2}</text>
              <text x="110" y="163" fill="var(--text-muted)" fontSize="8">Bottom resistor</text>

              {/* Ground */}
              <path d="M 90 190 L 90 200" stroke="#8C929E" strokeWidth="2" />
              <line x1="78" y1="200" x2="102" y2="200" stroke="#8C929E" strokeWidth="2" />
              <line x1="82" y1="205" x2="98" y2="205" stroke="#8C929E" strokeWidth="2" />
              <line x1="86" y1="210" x2="94" y2="210" stroke="#8C929E" strokeWidth="2" />

              {/* Current annotation */}
              <rect x="220" y="158" width="135" height="32" fill="#13161A" stroke="#252A32" rx="5" />
              <text x="232" y="177" fill="var(--text-secondary)" fontSize="10" fontFamily="var(--font-mono)">Divider current</text>
              <text x="318" y="177" fill="var(--success)" fontSize="10" fontWeight="700" fontFamily="var(--font-mono)">{currentMetric}</text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Circuits' && modelData.SYSTEM_TYPE?.includes('Buck')) {
      const vin = modelData.INPUT?.['Supply voltage']?.value || '5 V';
      const l1 = modelData.COMPONENTS?.['Inductor (L1)']?.value || '22 µH';
      const c1 = modelData.COMPONENTS?.['Capacitor (C1)']?.value || '100 µF';
      const esr = modelData.COMPONENTS?.['ESR (C1)']?.value || '20 mΩ';
      const fsw = modelData.COMPONENTS?.['Switch freq']?.value || '500 kHz';
      const iload = modelData.OUTPUT?.['Load current']?.value || '2 A';

      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>BUCK CONVERTER SCHEMATIC</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Real-time dynamic circuit rendering</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 240" fill="none">
              {/* Grid backdrop */}
              <defs>
                <pattern id="schematicGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#161A22" strokeWidth="0.5" />
                </pattern>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
              </defs>
              <rect width="400" height="240" fill="url(#schematicGrid)" />

              {/* Rails / Wires */}
              <path d="M 40 100 L 100 100" stroke="#8C929E" strokeWidth="2" />
              <path d="M 120 100 L 200 100" stroke="#8C929E" strokeWidth="2" />
              <path d="M 200 100 L 280 100" stroke="#8C929E" strokeWidth="2" />
              <path d="M 280 100 L 360 100" stroke="#8C929E" strokeWidth="2" />
              <path d="M 360 100 L 360 180" stroke="#8C929E" strokeWidth="2" />
              
              {/* GND Rails */}
              <path d="M 40 180 L 120 180" stroke="#8C929E" strokeWidth="2" />
              <path d="M 120 180 L 280 180" stroke="#8C929E" strokeWidth="2" />
              <path d="M 280 180 L 360 180" stroke="#8C929E" strokeWidth="2" />
              <path d="M 40 180 L 40 140" stroke="#8C929E" strokeWidth="2" />
              <path d="M 120 100 L 120 180" stroke="#8C929E" strokeWidth="2" />
              <path d="M 280 100 L 280 140" stroke="#8C929E" strokeWidth="2" />
              <path d="M 280 160 L 280 180" stroke="#8C929E" strokeWidth="2" />

              {/* Vin Source */}
              <circle cx="40" cy="120" r="16" fill="#13161A" stroke="#E8EAF0" strokeWidth="2" />
              <path d="M 40 110 L 40 130" stroke="#E8EAF0" strokeWidth="2" />
              <path d="M 30 120 L 50 120" stroke="#E8EAF0" strokeWidth="2" />
              <text x="64" y="120" fill="var(--text-primary)" fontSize="11" fontWeight="600" fontFamily="var(--font-mono)">{vin}</text>
              <text x="64" y="132" fill="var(--text-muted)" fontSize="8">Vin Source</text>

              {/* MOSFET Switch Symbol */}
              <rect x="90" y="90" width="20" height="20" fill="#13161A" stroke="#3B82F6" strokeWidth="2" rx="2" />
              <path d="M 85 100 L 90 100" stroke="#3B82F6" strokeWidth="1.5" />
              <path d="M 110 100 L 115 100" stroke="#3B82F6" strokeWidth="1.5" />
              <text x="75" y="82" fill="var(--accent-primary)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">Q1 (Switch)</text>
              <text x="75" y="72" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">Fsw: {fsw}</text>

              {/* Diode Symbol (pointing up) */}
              <polygon points="120,130 112,145 128,145" fill="#13161A" stroke="#E8EAF0" strokeWidth="2" />
              <line x1="112" y1="130" x2="128" y2="130" stroke="#E8EAF0" strokeWidth="2" />
              <text x="136" y="142" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--font-mono)">D1 (Fast)</text>

              {/* Inductor L1 Symbol */}
              <path d="M 200 100 C 205 90, 210 90, 215 100 C 220 90, 225 90, 230 100 C 235 90, 240 90, 245 100 C 250 90, 255 90, 260 100" stroke="#F59E0B" strokeWidth="2" fill="none" />
              <text x="195" y="82" fill="var(--accent-secondary)" fontSize="11" fontWeight="600" fontFamily="var(--font-mono)">L1: {l1}</text>
              <text x="195" y="72" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">Inductor</text>

              {/* Capacitor C1 Symbol */}
              <line x1="265" y1="140" x2="295" y2="140" stroke="#3B82F6" strokeWidth="3" />
              <line x1="265" y1="148" x2="295" y2="148" stroke="#3B82F6" strokeWidth="3" />
              {/* ESR resistor symbol */}
              <path d="M 280 148 L 275 152 L 285 156 L 275 160 L 280 164" stroke="#8C929E" strokeWidth="1.5" fill="none" />
              <text x="302" y="144" fill="var(--text-primary)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">C1: {c1}</text>
              <text x="302" y="154" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">ESR: {esr}</text>

              {/* Load resistor R_load */}
              <path d="M 360 120 L 355 125 L 365 130 L 355 135 L 365 140 L 355 145 L 360 150" stroke="#E8EAF0" strokeWidth="2" fill="none" />
              <text x="310" y="124" fill="var(--text-secondary)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">RLoad</text>
              <text x="310" y="134" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">Iload: {iload}</text>

              {/* Ground Symbol */}
              <path d="M 200 180 L 200 190" stroke="#8C929E" strokeWidth="2" />
              <line x1="190" y1="190" x2="210" y2="190" stroke="#8C929E" strokeWidth="2" />
              <line x1="194" y1="194" x2="206" y2="194" stroke="#8C929E" strokeWidth="2" />
              <line x1="198" y1="198" x2="202" y2="198" stroke="#8C929E" strokeWidth="2" />

              {/* Current Loop animations */}
              <circle cx="0" cy="0" r="3" fill="#22C55E">
                <animateMotion 
                  path="M 40 100 L 200 100 L 280 100 L 360 100 L 360 150 L 360 180 L 280 180 L 200 180 L 40 180 L 40 100" 
                  dur="2.5s" 
                  repeatCount="indefinite" 
                />
              </circle>
              <circle cx="0" cy="0" r="3" fill="#22C55E">
                <animateMotion 
                  path="M 40 100 L 200 100 L 280 100 L 360 100 L 360 150 L 360 180 L 280 180 L 200 180 L 40 180 L 40 100" 
                  dur="2.5s" 
                  begin="0.8s"
                  repeatCount="indefinite" 
                />
              </circle>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Circuits') {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-muted" style={{ height: '300px' }}>
          <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>
            {modelData.SYSTEM_TYPE || 'Circuit'} schematic not available yet
          </span>
          <span className="mt-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            SimForge will still answer and calculate this circuit, but no specialized drawing exists for this subtype.
          </span>
        </div>
      );
    }

    if (activeDomain === 'Structural' || activeDomain === 'Physics') {
      const structuralType = String(modelData.SYSTEM_TYPE || '').toLowerCase();
      const diagramCapability = resultsData?.visualization_capability;
      if (activeDomain === 'Physics' && diagramCapability && diagramCapability.diagram_status !== 'fully_rendered') {
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-[#0D0F12] border border-[#252A32] rounded-lg m-2" style={{ minHeight: '260px' }}>
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>
              {diagramCapability.diagram_message?.title || 'Diagram coming soon'}
            </span>
            <span className="mt-2 text-[11px] max-w-[340px]" style={{ color: 'var(--text-secondary)' }}>
              {diagramCapability.diagram_message?.message || 'The calculation is complete, but this dedicated diagram template is not ready yet.'}
            </span>
            <span className="mt-3 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              Status: {diagramCapability.status} · Solver: {diagramCapability.solver}
            </span>
          </div>
        );
      }
      if (structuralType.includes('ladder')) {
        const L = modelData.GEOMETRY?.['Ladder length']?.value || '5 m';
        const theta = modelData.GEOMETRY?.['Ladder angle']?.value || '60 deg';
        const mu = modelData.CONTACT?.['Floor coefficient of friction']?.value || '0.4';
        const xmax = resultsData?.metrics?.find(m => m.name === 'Maximum climb distance')?.value || '-';
        const nf = resultsData?.metrics?.find(m => m.name === 'Floor normal reaction')?.value || '-';
        const nw = resultsData?.metrics?.find(m => m.name === 'Wall reaction at slip')?.value || '-';
        return (
          <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>LADDER SLIP FREE-BODY DIAGRAM</span>
              <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Static equilibrium with friction limit</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="360" height="260" viewBox="0 0 400 280" fill="none">
                <rect width="400" height="280" fill="#0D0F12" />
                <defs>
                  <marker id="ladderArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
                  </marker>
                  <marker id="ladderArrowGreen" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#22C55E" />
                  </marker>
                </defs>
                <line x1="330" y1="38" x2="330" y2="230" stroke="#8C929E" strokeWidth="4" />
                <line x1="48" y1="230" x2="350" y2="230" stroke="#8C929E" strokeWidth="4" />
                <text x="336" y="60" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">smooth wall</text>
                <text x="58" y="248" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">rough floor, μ={mu}</text>
                <line x1="110" y1="230" x2="330" y2="60" stroke="#3B82F6" strokeWidth="8" strokeLinecap="round" />
                <text x="216" y="130" fill="var(--text-primary)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">L={L}, θ={theta}</text>
                <circle cx="235" cy="132" r="10" fill="#F59E0B" />
                <line x1="235" y1="142" x2="235" y2="170" stroke="#F59E0B" strokeWidth="2" />
                <line x1="235" y1="154" x2="220" y2="165" stroke="#F59E0B" strokeWidth="2" />
                <line x1="235" y1="154" x2="250" y2="165" stroke="#F59E0B" strokeWidth="2" />
                <line x1="235" y1="170" x2="225" y2="188" stroke="#F59E0B" strokeWidth="2" />
                <line x1="235" y1="170" x2="245" y2="188" stroke="#F59E0B" strokeWidth="2" />
                <path d="M 330 60 L 292 60" stroke="#EF4444" strokeWidth="2" markerEnd="url(#ladderArrow)" />
                <text x="286" y="56" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">Nw</text>
                <path d="M 110 230 L 110 190" stroke="#22C55E" strokeWidth="2" markerEnd="url(#ladderArrowGreen)" />
                <text x="118" y="200" fill="#22C55E" fontSize="9" fontFamily="var(--font-mono)">Nf</text>
                <path d="M 110 230 L 148 230" stroke="#EF4444" strokeWidth="2" markerEnd="url(#ladderArrow)" />
                <text x="150" y="224" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">f</text>
                <path d="M 235 145 L 235 188" stroke="#EF4444" strokeWidth="2" markerEnd="url(#ladderArrow)" />
                <text x="243" y="178" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">mg</text>
                <path d="M 178 176 L 178 215" stroke="#EF4444" strokeWidth="2" markerEnd="url(#ladderArrow)" />
                <text x="186" y="205" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">Mg</text>
                <rect x="34" y="34" width="166" height="58" fill="#13161A" stroke="#252A32" rx="4" />
                <text x="44" y="52" fill="#3B82F6" fontSize="9" fontFamily="var(--font-mono)">x max = {xmax}</text>
                <text x="44" y="68" fill="#22C55E" fontSize="9" fontFamily="var(--font-mono)">Nf = {nf}</text>
                <text x="44" y="84" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">Nw = {nw}</text>
              </svg>
            </div>
          </div>
        );
      }
      if (structuralType.includes('pulley') || structuralType.includes('block')) {
        const m1 = modelData.MASSES?.['Mass m1']?.value || '5 kg';
        const m2 = modelData.MASSES?.['Mass m2']?.value || '3 kg';
        const mu = modelData.CONTACT?.['Coefficient of friction']?.value || '0.2';
        const angle = modelData.CONTACT?.['Incline angle']?.value || '0 deg';
        const isInclinedPulley = parseUnit(angle) > 0.01 || structuralType.includes('inclined');
        const isSpringPulley = structuralType.includes('spring') || Boolean(modelData.SPRING);
        const springK = modelData.SPRING?.['Spring constant']?.value || '100 N/m';
        const accel = resultsData?.metrics?.find(m => m.name === 'Acceleration')?.value;
        const tension = resultsData?.metrics?.find(m => m.name === 'String tension')?.value;
        return (
          <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>PULLEY SYSTEM + FREE-BODY DIAGRAMS</span>
              <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>{activeDomain === 'Physics' ? 'Physics visualization registry: ready' : 'Correct structural subtype diagram'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="360" height="260" viewBox="0 0 400 280" fill="none">
                <rect width="400" height="280" fill="#0D0F12" />
                <defs>
                  <marker id="forceArrowPulley" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
                  </marker>
                </defs>
                {isInclinedPulley ? (
                  <>
                    <line x1="35" y1="178" x2="188" y2="90" stroke="#8C929E" strokeWidth="4" />
                    <text x="45" y="194" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">rough incline θ={angle}, μ={mu}</text>
                    <g transform="rotate(-30 105 128)">
                      <rect x="76" y="107" width="58" height="42" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" rx="3" />
                      <text x="105" y="128" fill="var(--text-primary)" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">m1</text>
                      <text x="105" y="141" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">{m1}</text>
                    </g>
                  </>
                ) : (
                  <>
                    <line x1="35" y1="145" x2="190" y2="145" stroke="#8C929E" strokeWidth="4" />
                    <text x="45" y="160" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">rough table, μ={mu}</text>
                    <rect x="72" y="102" width="58" height="42" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" rx="3" />
                    <text x="101" y="123" fill="var(--text-primary)" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">m1</text>
                    <text x="101" y="136" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">{m1}</text>
                  </>
                )}
                <circle cx="210" cy="82" r="28" fill="#13161A" stroke="#F59E0B" strokeWidth="3" />
                <circle cx="210" cy="82" r="5" fill="#F59E0B" />
                <path d={isInclinedPulley ? "M 128 112 C 155 98, 170 82, 182 82" : "M 130 122 C 160 122, 175 82, 182 82"} stroke="#E8EAF0" strokeWidth="2" fill="none" />
                <path d="M 238 82 L 238 170" stroke="#E8EAF0" strokeWidth="2" />
                <rect x="212" y="170" width="52" height="42" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" rx="3" />
                <text x="238" y="190" fill="var(--text-primary)" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">m2</text>
                <text x="238" y="203" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">{m2}</text>
                {isSpringPulley && (
                  <>
                    <path d="M 238 212 L 238 222 L 228 226 L 248 234 L 228 242 L 248 250 L 238 256 L 238 270" stroke="#22C55E" strokeWidth="2" fill="none" />
                    <text x="255" y="246" fill="#22C55E" fontSize="8" fontFamily="var(--font-mono)">k={springK}</text>
                  </>
                )}
                <path d={isInclinedPulley ? "M 148 102 L 127 114" : "M 160 122 L 132 122"} stroke="#EF4444" strokeWidth="2" markerEnd="url(#forceArrowPulley)" />
                <text x="147" y="102" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">T</text>
                <path d="M 238 158 L 238 130" stroke="#EF4444" strokeWidth="2" markerEnd="url(#forceArrowPulley)" />
                <text x="247" y="145" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">T</text>
                <path d="M 238 215 L 238 246" stroke="#EF4444" strokeWidth="2" markerEnd="url(#forceArrowPulley)" />
                <text x="248" y="235" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">m2g</text>
                <path d={isInclinedPulley ? "M 103 103 L 88 77" : "M 101 100 L 101 72"} stroke="#22C55E" strokeWidth="2" markerEnd="url(#forceArrowPulley)" />
                <text x={isInclinedPulley ? "78" : "110"} y={isInclinedPulley ? "82" : "84"} fill="#22C55E" fontSize="9" fontFamily="var(--font-mono)">N</text>
                <path d={isInclinedPulley ? "M 105 145 L 105 176" : "M 101 146 L 101 174"} stroke="#EF4444" strokeWidth="2" markerEnd="url(#forceArrowPulley)" />
                <text x="112" y="164" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">m1g</text>
                <path d={isInclinedPulley ? "M 88 142 L 62 158" : "M 72 123 L 44 123"} stroke="#EF4444" strokeWidth="2" markerEnd="url(#forceArrowPulley)" />
                <text x={isInclinedPulley ? "63" : "50"} y={isInclinedPulley ? "148" : "115"} fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)">f</text>
                {(accel || tension) && (
                  <>
                    <text x="290" y="42" fill="var(--accent-primary)" fontSize="9" fontFamily="var(--font-mono)">a = {accel || '-'}</text>
                    <text x="290" y="56" fill="var(--accent-primary)" fontSize="9" fontFamily="var(--font-mono)">T = {tension || '-'}</text>
                  </>
                )}
              </svg>
            </div>
          </div>
        );
      }

      if (structuralType.includes('truss')) {
        return (
          <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>TRUSS GEOMETRY</span>
              <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Joints, members, supports</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
                <rect width="400" height="220" fill="#0D0F12" />
                <defs>
                  <marker id="trussArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
                  </marker>
                </defs>
                <path d="M 60 150 L 170 70 L 280 150 L 60 150 M 170 70 L 170 150 M 60 150 L 280 150" stroke="#3B82F6" strokeWidth="3" fill="none" />
                {[[60,150,'A'],[170,70,'B'],[170,150,'C'],[280,150,'D']].map(([x,y,label]) => (
                  <g key={label}>
                    <circle cx={x} cy={y} r="6" fill="#F59E0B" />
                    <text x={x} y={y - 12} fill="var(--text-primary)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">{label}</text>
                  </g>
                ))}
                <path d="M 170 36 L 170 62" stroke="#EF4444" strokeWidth="2" markerEnd="url(#trussArrow)" />
                <text x="180" y="50" fill="#EF4444" fontSize="10" fontFamily="var(--font-mono)">Load</text>
                <polygon points="48,162 72,162 60,150" fill="#8C929E" />
                <circle cx="280" cy="162" r="5" fill="#8C929E" />
                <circle cx="295" cy="162" r="5" fill="#8C929E" />
                <text x="60" y="186" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">Pinned</text>
                <text x="288" y="186" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">Roller</text>
              </svg>
            </div>
          </div>
        );
      }

      if (structuralType.includes('frame')) {
        return (
          <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>STRUCTURAL FRAME GEOMETRY</span>
              <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Supports, columns, beam, load</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
                <rect width="400" height="220" fill="#0D0F12" />
                <defs>
                  <marker id="frameArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
                  </marker>
                </defs>
                <path d="M 95 165 L 95 65 L 295 65 L 295 165" stroke="#3B82F6" strokeWidth="5" fill="none" />
                <rect x="72" y="165" width="46" height="12" fill="#4B5260" />
                <rect x="272" y="165" width="46" height="12" fill="#4B5260" />
                <path d="M 195 25 L 195 58" stroke="#EF4444" strokeWidth="2.5" markerEnd="url(#frameArrow)" />
                <text x="204" y="43" fill="#EF4444" fontSize="10" fontFamily="var(--font-mono)">P</text>
                <path d="M 95 190 L 295 190" stroke="#8C929E" strokeDasharray="4,4" />
                <text x="195" y="205" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">Frame span</text>
                <path d="M 325 65 L 325 165" stroke="#8C929E" strokeDasharray="4,4" />
                <text x="333" y="118" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--font-mono)">Height</text>
              </svg>
            </div>
          </div>
        );
      }

      const length = modelData.GEOMETRY?.['Length']?.value || '500 mm';
      const width = modelData.GEOMETRY?.['Width']?.value || '30 mm';
      const height = modelData.GEOMETRY?.['Height']?.value || '10 mm';
      const material = modelData.MATERIAL?.['Material']?.value || 'Structural steel';
      const force = modelData.LOADING?.['Magnitude']?.value || '500 N';

      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>CANTILEVER BEAM GEOMETRY</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Boundary conditions & physical dimensions</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <defs>
                <pattern id="beamGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#161A22" strokeWidth="0.5" />
                </pattern>
                {/* Cross Hatching Pattern for Clamp support */}
                <pattern id="hatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#4B5260" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="400" height="220" fill="url(#beamGrid)" />

              {/* Fixed Wall Support Hatching block */}
              <rect x="10" y="40" width="30" height="140" fill="url(#hatch)" />
              <line x1="40" y1="40" x2="40" y2="180" stroke="#8C929E" strokeWidth="3" />

              {/* Cantilever Beam bar */}
              <rect x="40" y="90" width="280" height="40" fill="#1C2026" stroke="#3B82F6" strokeWidth="2.5" />
              
              {/* Force Load Vector Arrow */}
              <path d="M 320 30 L 320 85" stroke="#EF4444" strokeWidth="3" markerEnd="url(#arrow)" />
              <polygon points="320,90 315,80 325,80" fill="#EF4444" />
              <text x="328" y="55" fill="var(--error)" fontSize="11" fontWeight="600" fontFamily="var(--font-mono)">F: {force}</text>
              <text x="328" y="67" fill="var(--text-muted)" fontSize="8">Point Load</text>

              {/* Dimensions labels */}
              {/* Length dimension */}
              <path d="M 40 150 L 320 150" stroke="#8C929E" strokeWidth="1" strokeDasharray="3,3" />
              <path d="M 40 145 L 40 155" stroke="#8C929E" strokeWidth="1" />
              <path d="M 320 145 L 320 155" stroke="#8C929E" strokeWidth="1" />
              <text x="160" y="166" fill="var(--text-secondary)" fontSize="10" fontWeight="500" fontFamily="var(--font-mono)">L: {length}</text>

              {/* Height dimension */}
              <path d="M 334 90 L 334 130" stroke="#8C929E" strokeWidth="1" strokeDasharray="3,3" />
              <path d="M 329 90 L 339 90" stroke="#8C929E" strokeWidth="1" />
              <path d="M 329 130 L 339 130" stroke="#8C929E" strokeWidth="1" />
              <text x="342" y="114" fill="var(--text-secondary)" fontSize="10" fontWeight="500" fontFamily="var(--font-mono)">h: {height}</text>

              {/* Material info */}
              <rect x="45" y="184" width="310" height="24" fill="#13161A" stroke="#252A32" rx="4" />
              <text x="55" y="200" fill="var(--text-secondary)" fontSize="9">
                Material System: <tspan fill="var(--accent-primary)" fontWeight="500" fontFamily="var(--font-mono)">{material}</tspan> (w={width})
              </text>

              <text x="15" y="114" fill="var(--text-muted)" fontSize="9" transform="rotate(-90 15 114)" textAnchor="middle">CLAMPED ROOT</text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Fluids') {
      const diameter = modelData.GEOMETRY?.['Diameter']?.value || '50 mm';
      const length = modelData.GEOMETRY?.['Length']?.value || '500 mm';
      const vel = modelData.BOUNDARY_CONDITIONS?.['Inlet velocity']?.value || '2 m/s';
      const fluid = modelData.FLUID?.['Fluid']?.value || 'Air';

      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>INTERNAL PIPE FLOW SCHEMA</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Circular duct boundaries & fluid profile</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <rect width="400" height="220" fill="#0D0F12" />

              {/* Pipe wall boundaries */}
              <line x1="60" y1="70" x2="340" y2="70" stroke="#8C929E" strokeWidth="4" />
              <line x1="60" y1="150" x2="340" y2="150" stroke="#8C929E" strokeWidth="4" />

              {/* Inlet velocities indicators */}
              <path d="M 20 85 L 50 85" stroke="#3B82F6" strokeWidth="2" />
              <polygon points="55,85 47,81 47,89" fill="#3B82F6" />

              <path d="M 20 110 L 50 110" stroke="#3B82F6" strokeWidth="2" />
              <polygon points="55,110 47,106 47,114" fill="#3B82F6" />

              <path d="M 20 135 L 50 135" stroke="#3B82F6" strokeWidth="2" />
              <polygon points="55,135 47,131 47,139" fill="#3B82F6" />

              <text x="15" y="60" fill="var(--accent-primary)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">Inlet Vin: {vel}</text>

              {/* Developed parabolic profile shape */}
              <path d="M 120 70 Q 180 110, 120 150" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="3,3" fill="none" />
              <path d="M 200 70 Q 280 110, 200 150" stroke="#3B82F6" strokeWidth="1.5" fill="none" />

              {/* Velocity vectors inside */}
              <path d="M 200 90 L 245 90" stroke="#22C55E" strokeWidth="1.5" />
              <polygon points="248,90 242,87 242,93" fill="#22C55E" />

              <path d="M 200 110 L 275 110" stroke="#22C55E" strokeWidth="2" />
              <polygon points="278,110 270,106 270,114" fill="#22C55E" />

              <path d="M 200 130 L 245 130" stroke="#22C55E" strokeWidth="1.5" />
              <polygon points="248,130 242,127 242,133" fill="#22C55E" />

              {/* Labels */}
              {/* Diameter D */}
              <path d="M 360 70 L 360 150" stroke="#8C929E" strokeWidth="1" strokeDasharray="3,3" />
              <path d="M 355 70 L 365 70" stroke="#8C929E" strokeWidth="1" />
              <path d="M 355 150 L 365 150" stroke="#8C929E" strokeWidth="1" />
              <text x="370" y="114" fill="var(--text-secondary)" fontSize="10" fontWeight="500" fontFamily="var(--font-mono)">D: {diameter}</text>

              {/* Length L */}
              <path d="M 60 170 L 340 170" stroke="#8C929E" strokeWidth="1" strokeDasharray="3,3" />
              <path d="M 60 165 L 60 175" stroke="#8C929E" strokeWidth="1" />
              <path d="M 340 165 L 340 175" stroke="#8C929E" strokeWidth="1" />
              <text x="180" y="186" fill="var(--text-secondary)" fontSize="10" fontWeight="500" fontFamily="var(--font-mono)">L: {length}</text>

              {/* Material info */}
              <rect x="50" y="196" width="300" height="20" fill="#13161A" stroke="#252A32" rx="4" />
              <text x="60" y="210" fill="var(--text-secondary)" fontSize="8">
                Medium Fluid: <tspan fill="var(--accent-primary)" fontWeight="500" fontFamily="var(--font-mono)">{fluid}</tspan> (Wall textures: Smooth boundary)
              </text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Semiconductors') {
      const length = modelData.GEOMETRY?.['Gate Length']?.value || '180 nm';
      const width = modelData.GEOMETRY?.['Width']?.value || '2.0 µm';
      const tox = modelData.GEOMETRY?.['Oxide Thickness']?.value || '4.0 nm';
      const mobility = modelData.MATERIAL?.['Channel Mobility']?.value || '450 cm²/V·s';
      const vgs = modelData.BIASING?.['Gate Voltage']?.value || '1.8 V';

      // Parse gate voltage to dynamically control inversion layer width
      const vgsNum = parseUnit(vgs);
      const vth = 0.4;
      const hasInversion = vgsNum > vth;
      const channelThickness = hasInversion ? Math.min(10, (vgsNum - vth) * 5) : 0;

      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>N-CHANNEL MOSFET CROSS-SECTION</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Dynamic inversion channel visualization</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <defs>
                <pattern id="semiGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#161A22" strokeWidth="0.5" />
                </pattern>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
              </defs>
              <rect width="400" height="220" fill="url(#semiGrid)" />

              {/* P-Substrate Block (Bottom half) */}
              <rect x="40" y="110" width="320" height="70" fill="#18131A" stroke="#4C1D5C" strokeWidth="1.5" />
              <text x="200" y="160" fill="#E879F9" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)" textAnchor="middle">P-Substrate (Si)</text>

              {/* N+ Source (left) */}
              <rect x="40" y="110" width="80" height="30" fill="#132B1F" stroke="#22C55E" strokeWidth="1.5" />
              <text x="80" y="130" fill="#4ADE80" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)" textAnchor="middle">N+ Source</text>

              {/* N+ Drain (right) */}
              <rect x="280" y="110" width="80" height="30" fill="#132B1F" stroke="#22C55E" strokeWidth="1.5" />
              <text x="320" y="130" fill="#4ADE80" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)" textAnchor="middle">N+ Drain</text>

              {/* Inversion Layer (Channel between source and drain, just below oxide) */}
              {hasInversion && (
                <rect 
                  x="120" 
                  y="110" 
                  width="160" 
                  height={channelThickness} 
                  fill="#22C55E" 
                  opacity="0.85" 
                  style={{ transition: 'height 0.3s ease' }}
                />
              )}
              {hasInversion && (
                <text x="200" y="125" fill="#22C55E" fontSize="8" fontWeight="500" textAnchor="middle">Inversion Channel Active</text>
              )}

              {/* Oxide layer (SiO2) */}
              <rect x="110" y="98" width="180" height="12" fill="#2A2F3A" stroke="#8C929E" strokeWidth="1" />
              <text x="200" y="106" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">SiO2 (Gate Oxide: {tox})</text>

              {/* Gate (Poly Silicon) */}
              <rect x="130" y="70" width="140" height="28" fill="#131C2E" stroke="#3B82F6" strokeWidth="1.5" />
              <text x="200" y="88" fill="var(--accent-primary)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)" textAnchor="middle">Metal/Poly Gate: {vgs}</text>

              {/* Contacts */}
              {/* Gate contact line */}
              <line x1="200" y1="70" x2="200" y2="40" stroke="#3B82F6" strokeWidth="2" />
              <circle cx="200" cy="40" r="3" fill="#3B82F6" />
              <text x="200" y="32" fill="var(--accent-primary)" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)" textAnchor="middle">GATE</text>

              {/* Source Contact */}
              <path d="M 80 110 L 80 50 L 50 50" stroke="#8C929E" strokeWidth="2" />
              <circle cx="50" cy="50" r="3" fill="#8C929E" />
              <text x="44" y="44" fill="var(--text-muted)" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)">SOURCE (0V)</text>

              {/* Drain Contact */}
              <path d="M 320 110 L 320 50 L 350 50" stroke="#8C929E" strokeWidth="2" />
              <circle cx="350" cy="50" r="3" fill="#8C929E" />
              <text x="356" y="54" fill="var(--text-muted)" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)">DRAIN</text>

              {/* Parameter display tag at bottom */}
              <rect x="50" y="190" width="300" height="20" fill="#13161A" stroke="#252A32" rx="4" />
              <text x="60" y="203" fill="var(--text-secondary)" fontSize="8">
                L_gate: <tspan fill="var(--accent-primary)" fontWeight="500" fontFamily="var(--font-mono)">{length}</tspan> | Width: <tspan fill="var(--accent-primary)" fontWeight="500" fontFamily="var(--font-mono)">{width}</tspan> | Mobility: <tspan fill="var(--accent-secondary)" fontFamily="var(--font-mono)">{mobility}</tspan>
              </text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Thermal') {
      const q = modelData.HEAT_LOAD?.['Power dissipation']?.value || '25 W';
      const tamb = modelData.TEMPERATURES?.['Ambient temperature']?.value || '25 C';
      const tj = modelData.TEMPERATURES?.['Maximum junction temperature']?.value || '75 C';
      const rjc = modelData.THERMAL_PATH?.['Junction-to-case resistance']?.value || '1.0 K/W';
      const ri = modelData.THERMAL_PATH?.['Interface resistance']?.value || '0.5 K/W';
      const rhs = getMetricValue('Required heatsink resistance', '-');
      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>THERMAL RESISTANCE NETWORK</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Junction to ambient path</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <rect width="400" height="220" fill="#0D0F12" />
              <defs>
                <marker id="thermalArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
                </marker>
              </defs>
              <rect x="34" y="78" width="70" height="52" rx="6" fill="#1C2026" stroke="#EF4444" strokeWidth="2" />
              <text x="69" y="99" fill="var(--text-primary)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">IC</text>
              <text x="69" y="115" fill="#EF4444" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">Q={q}</text>
              <path d="M 104 104 L 144 104" stroke="#EF4444" strokeWidth="2" markerEnd="url(#thermalArrow)" />
              <rect x="145" y="84" width="58" height="40" rx="5" fill="#13161A" stroke="#F59E0B" />
              <text x="174" y="108" fill="#F59E0B" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">Rjc {rjc}</text>
              <path d="M 203 104 L 238 104" stroke="#EF4444" strokeWidth="2" markerEnd="url(#thermalArrow)" />
              <rect x="239" y="84" width="58" height="40" rx="5" fill="#13161A" stroke="#3B82F6" />
              <text x="268" y="108" fill="#3B82F6" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">TIM {ri}</text>
              <path d="M 297 104 L 336 104" stroke="#EF4444" strokeWidth="2" markerEnd="url(#thermalArrow)" />
              <path d="M 338 78 L 370 78 M 338 92 L 365 92 M 338 106 L 370 106 M 338 120 L 365 120 M 338 134 L 370 134" stroke="#22C55E" strokeWidth="4" />
              <text x="350" y="155" fill="#22C55E" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">Rhs {rhs}</text>
              <rect x="62" y="176" width="276" height="24" fill="#13161A" stroke="#252A32" rx="4" />
              <text x="76" y="192" fill="var(--text-secondary)" fontSize="9">Temperature budget: <tspan fill="var(--accent-primary)" fontFamily="var(--font-mono)">{tamb}</tspan> to <tspan fill="var(--accent-primary)" fontFamily="var(--font-mono)">{tj}</tspan></text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Control') {
      const plant = modelData.PLANT?.['Transfer function']?.value || '10/(s*(s+2))';
      const kp = getMetricValue('Kp', modelData.CONTROLLER?.Kp?.value || '-');
      const ki = getMetricValue('Ki', modelData.CONTROLLER?.Ki?.value || '-');
      const kd = getMetricValue('Kd', modelData.CONTROLLER?.Kd?.value || '-');
      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>PID CLOSED-LOOP BLOCK DIAGRAM</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Unity feedback estimate</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <rect width="400" height="220" fill="#0D0F12" />
              <defs>
                <marker id="ctrlArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
              </defs>
              <circle cx="74" cy="100" r="16" fill="#13161A" stroke="#8C929E" />
              <text x="69" y="104" fill="var(--text-primary)" fontSize="14">+</text>
              <text x="70" y="122" fill="var(--text-muted)" fontSize="10">-</text>
              <path d="M 25 100 L 56 100" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#ctrlArrow)" />
              <rect x="115" y="72" width="92" height="56" fill="#1C2026" stroke="#3B82F6" rx="5" />
              <text x="161" y="94" fill="var(--accent-primary)" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">PID</text>
              <text x="161" y="110" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">Kp {kp} Ki {ki}</text>
              <text x="161" y="122" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">Kd {kd}</text>
              <path d="M 90 100 L 115 100" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#ctrlArrow)" />
              <rect x="245" y="72" width="100" height="56" fill="#1C2026" stroke="#22C55E" rx="5" />
              <text x="295" y="98" fill="#22C55E" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">Plant</text>
              <text x="295" y="115" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">{plant}</text>
              <path d="M 207 100 L 245 100" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#ctrlArrow)" />
              <path d="M 345 100 L 380 100" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#ctrlArrow)" />
              <path d="M 362 100 L 362 166 L 74 166 L 74 118" stroke="#8C929E" strokeWidth="1.8" fill="none" markerEnd="url(#ctrlArrow)" />
              <text x="218" y="184" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">feedback</text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Materials') {
      const material = modelData.MATERIAL?.Material?.value || 'Steel';
      const minStress = modelData.LOADING?.['Minimum stress']?.value || '20 MPa';
      const maxStress = modelData.LOADING?.['Maximum stress']?.value || '220 MPa';
      const sf = getMetricValue('Fatigue safety factor', '-');
      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>GOODMAN FATIGUE CHECK</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>{material}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <rect width="400" height="220" fill="#0D0F12" />
              <line x1="70" y1="165" x2="330" y2="165" stroke="#8C929E" />
              <line x1="70" y1="165" x2="70" y2="42" stroke="#8C929E" />
              <path d="M 70 60 L 315 165" stroke="#22C55E" strokeWidth="2.5" />
              <circle cx="155" cy="118" r="6" fill="#3B82F6" />
              <text x="200" y="36" fill="var(--text-primary)" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">Stress cycle {minStress} to {maxStress}</text>
              <text x="199" y="192" fill="var(--text-muted)" fontSize="9" textAnchor="middle">Mean stress</text>
              <text x="34" y="106" fill="var(--text-muted)" fontSize="9" transform="rotate(-90 34 106)" textAnchor="middle">Alternating stress</text>
              <text x="168" y="112" fill="var(--accent-primary)" fontSize="9" fontFamily="var(--font-mono)">operating point</text>
              <rect x="88" y="22" width="224" height="22" fill="#13161A" stroke="#252A32" rx="4" />
              <text x="200" y="37" fill="var(--text-secondary)" fontSize="9" textAnchor="middle">Fatigue safety factor: <tspan fill="var(--accent-primary)" fontFamily="var(--font-mono)">{sf}</tspan></text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Power') {
      const v1 = modelData.INPUT?.['Primary voltage']?.value || '240 V';
      const v2 = modelData.INPUT?.['Secondary voltage']?.value || '120 V';
      const i2 = modelData.INPUT?.['Secondary current']?.value || '10 A';
      const losses = getMetricValue('Total losses', '-');
      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>TRANSFORMER POWER BALANCE</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Steady AC model</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <rect width="400" height="220" fill="#0D0F12" />
              <defs>
                <marker id="powerArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
              </defs>
              <path d="M 40 110 L 120 110" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#powerArrow)" />
              <path d="M 280 110 L 360 110" stroke="#22C55E" strokeWidth="2" markerEnd="url(#powerArrow)" />
              <path d="M 145 65 C 120 75, 120 145, 145 155 M 160 65 C 135 75, 135 145, 160 155 M 240 65 C 265 75, 265 145, 240 155 M 255 65 C 280 75, 280 145, 255 155" stroke="#F59E0B" strokeWidth="3" fill="none" />
              <line x1="188" y1="55" x2="188" y2="165" stroke="#8C929E" strokeWidth="2" />
              <line x1="212" y1="55" x2="212" y2="165" stroke="#8C929E" strokeWidth="2" />
              <text x="78" y="92" fill="var(--accent-primary)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">Primary {v1}</text>
              <text x="322" y="92" fill="#22C55E" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">Secondary {v2}</text>
              <text x="322" y="132" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">Load {i2}</text>
              <rect x="118" y="178" width="164" height="24" fill="#13161A" stroke="#252A32" rx="4" />
              <text x="200" y="194" fill="var(--text-secondary)" fontSize="9" textAnchor="middle">Losses: <tspan fill="#EF4444" fontFamily="var(--font-mono)">{losses}</tspan></text>
            </svg>
          </div>
        </div>
      );
    }

    if (activeDomain === 'Aerospace') {
      if (modelData?.SYSTEM_TYPE?.toLowerCase().includes('wing') || modelData?.SYSTEM_TYPE?.toLowerCase().includes('airfoil') || resultsData?.wing_profile || resultsData?.alpha_list) {
        const span = modelData.GEOMETRY?.['Wingspan']?.value || '2 m';
        const chord = modelData.GEOMETRY?.['Chord']?.value || '0.3 m';
        const airfoil = modelData.GEOMETRY?.['Airfoil']?.value || 'NACA 4412';
        const speed = modelData.FLIGHT_CONDITIONS?.['Airspeed']?.value || '25 m/s';
        const aoa = modelData.FLIGHT_CONDITIONS?.['Angle of attack']?.value || '6 deg';
        const isAirfoil = modelData?.SYSTEM_TYPE?.toLowerCase().includes('airfoil') || resultsData?.alpha_list;

        return (
          <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>{isAirfoil ? 'AIRFOIL POLAR' : 'RECTANGULAR UAV WING'}</span>
              <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>{isAirfoil ? 'XFOIL polar adapter / analytical fallback' : 'Finite-wing lifting-line estimate'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
                <rect width="400" height="220" fill="#0D0F12" />
                <defs>
                  <marker id="wingArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                  </marker>
                </defs>
                <rect x="70" y="75" width="260" height="70" fill="rgba(59,130,246,0.14)" stroke="#3B82F6" strokeWidth="2" rx="2" />
                <line x1="70" y1="155" x2="330" y2="155" stroke="var(--text-muted)" strokeWidth="1" />
                <line x1="70" y1="150" x2="70" y2="160" stroke="var(--text-muted)" strokeWidth="1" />
                <line x1="330" y1="150" x2="330" y2="160" stroke="var(--text-muted)" strokeWidth="1" />
                <text x="200" y="171" fill="var(--accent-primary)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">span b = {span}</text>
                <line x1="345" y1="75" x2="345" y2="145" stroke="var(--text-muted)" strokeWidth="1" />
                <line x1="340" y1="75" x2="350" y2="75" stroke="var(--text-muted)" strokeWidth="1" />
                <line x1="340" y1="145" x2="350" y2="145" stroke="var(--text-muted)" strokeWidth="1" />
                <text x="356" y="113" fill="var(--accent-primary)" fontSize="9" fontFamily="var(--font-mono)">c = {chord}</text>
                <path d="M 40,110 L 68,110" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#wingArrow)" />
                <text x="38" y="100" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--font-mono)">V = {speed}</text>
                <path d="M 200,82 C 165,82 125,95 85,122" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeDasharray="4,4" />
                <path d="M 200,82 C 235,82 275,95 315,122" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeDasharray="4,4" />
                <text x="200" y="62" fill="var(--text-primary)" fontSize="11" fontWeight="600" fontFamily="var(--font-mono)" textAnchor="middle">{airfoil} at α = {aoa}</text>
                <rect x="50" y="190" width="300" height="20" fill="#13161A" stroke="#252A32" rx="4" />
                <text x="60" y="203" fill="var(--text-secondary)" fontSize="8">
                  Planform: <tspan fill="var(--accent-primary)" fontFamily="var(--font-mono)">Rectangular</tspan> | Distribution: <tspan fill="var(--accent-primary)" fontFamily="var(--font-mono)">Elliptical estimate</tspan>
                </text>
              </svg>
            </div>
          </div>
        );
      }

      const dt = modelData.GEOMETRY?.['Throat Diameter']?.value || '40 mm';
      const expansion = modelData.GEOMETRY?.['Expansion ratio']?.value || '8.0';
      const angle = modelData.GEOMETRY?.['Divergent Angle']?.value || '15 deg';
      const pc = modelData.PROPULSION?.['Chamber Pressure']?.value || '5.0 MPa';
      const tc = modelData.PROPULSION?.['Chamber Temperature']?.value || '3000 K';

      // Parse expansion ratio to control exit height
      const expVal = parseFloat(expansion) || 8.0;
      const exitHeightFactor = Math.min(2.5, Math.max(1.2, Math.sqrt(expVal) / 2.82)); // visually scaling Exit height

      // SVG path calculations
      const r_t = 12; // visual throat radius
      const r_in = 40; // chamber inlet radius
      const r_out = r_t * exitHeightFactor * 2.2; // visual exit radius
      
      const pt_in_top = `40, ${110 - r_in}`;
      const pt_throat_top = `150, ${110 - r_t}`;
      const pt_exit_top = `320, ${110 - r_out}`;
      const pt_exit_bottom = `320, ${110 + r_out}`;
      const pt_throat_bottom = `150, ${110 + r_t}`;
      const pt_in_bottom = `40, ${110 + r_in}`;

      // Build SVG contour lines
      const topWallPath = `M ${pt_in_top} Q 110,${110 - r_t} ${pt_throat_top} L ${pt_exit_top}`;
      const bottomWallPath = `M ${pt_in_bottom} Q 110,${110 + r_t} ${pt_throat_bottom} L ${pt_exit_bottom}`;

      return (
        <div className="flex flex-col p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg m-2">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[12px] font-bold text-primary font-mono" style={{ color: 'var(--text-primary)' }}>CONVERGING-DIVERGING NOZZLE SHAPE</span>
            <span className="text-[10px] text-muted" style={{ color: 'var(--text-muted)' }}>Isentropic 1D thermodynamic expansion contour</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="360" height="220" viewBox="0 0 400 220" fill="none">
              <rect width="400" height="220" fill="#0D0F12" />

              {/* Nozzle interior gas color filling - Gradient along nozzle */}
              <defs>
                <linearGradient id="nozzleGas" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.8" />    {/* Hot subsonic chamber */}
                  <stop offset="35%" stopColor="#F59E0B" stopOpacity="0.8" />   {/* Sonic throat */}
                  <stop offset="70%" stopColor="#3B82F6" stopOpacity="0.4" />   {/* Supersonic expansion */}
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.15" />  {/* Exhaust exit flow */}
                </linearGradient>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
              </defs>

              {/* Gas body path */}
              <path 
                d={`M ${pt_in_top} Q 110,${110 - r_t} ${pt_throat_top} L ${pt_exit_top} L ${pt_exit_bottom} L ${pt_throat_bottom} Q 110,${110 + r_t} ${pt_in_bottom} Z`} 
                fill="url(#nozzleGas)" 
              />

              {/* Nozzle Solid walls (metallic borders) */}
              <path d={topWallPath} stroke="#E8EAF0" strokeWidth="4" fill="none" />
              <path d={bottomWallPath} stroke="#E8EAF0" strokeWidth="4" fill="none" />

              {/* Gas flow lines/plumes inside */}
              <path d="M 40,110 L 320,110" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />

              {/* Speed sound / sonic line at throat */}
              <line x1="150" y1={110 - r_t} x2="150" y2={110 + r_t} stroke="#EF4444" strokeWidth="1.5" strokeDasharray="2,2" />
              <text x="150" y="80" fill="#EF4444" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">Throat (M=1.0)</text>

              {/* Flow Arrows showing expansion */}
              <path d="M 60,110 L 90,110" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <path d="M 170,110 L 220,110" stroke="#F59E0B" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <path d="M 240,115 L 290,115" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow)" />

              {/* Boundary labels */}
              {/* Throat Diameter */}
              <line x1="142" y1={110 - r_t} x2="142" y2={110 + r_t} stroke="var(--text-muted)" strokeWidth="0.5" />
              <text x="135" y="113" fill="var(--accent-secondary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="end">Dt: {dt}</text>

              {/* Expansion exit height */}
              <line x1="330" y1={110 - r_out} x2="330" y2={110 + r_out} stroke="var(--text-muted)" strokeWidth="0.5" />
              <line x1="326" y1={110 - r_out} x2="334" y2={110 - r_out} stroke="var(--text-muted)" strokeWidth="0.5" />
              <line x1="326" y1={110 + r_out} x2="334" y2={110 + r_out} stroke="var(--text-muted)" strokeWidth="0.5" />
              <text x="338" y="113" fill="var(--accent-primary)" fontSize="8" fontFamily="var(--font-mono)">ε = {expansion}</text>

              {/* Chamber labels on left */}
              <text x="50" y="145" fill="var(--text-primary)" fontSize="9" fontWeight="600" fontFamily="var(--font-mono)">Pc: {pc}</text>
              <text x="50" y="157" fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)">Tc: {tc}</text>

              {/* Parameter display tag at bottom */}
              <rect x="50" y="190" width="300" height="20" fill="#13161A" stroke="#252A32" rx="4" />
              <text x="60" y="203" fill="var(--text-secondary)" fontSize="8">
                Divergent Angle: <tspan fill="var(--accent-primary)" fontWeight="500" fontFamily="var(--font-mono)">{angle}</tspan> | Mode: <tspan fill="var(--accent-primary)" fontWeight="500" fontFamily="var(--font-mono)">Choked Isentropic</tspan>
              </text>
            </svg>
          </div>
        </div>
      );
    }
  };

  const clampZoom = (value) => Math.min(2.5, Math.max(0.55, value));

  const resetSchematicView = () => {
    setSchematicZoom(1);
    setSchematicPan({ x: 0, y: 0 });
  };

  const handleSchematicWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    setSchematicZoom(prev => clampZoom(Number((prev + delta).toFixed(2))));
  };

  const handlePointerDown = (event) => {
    setIsPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: schematicPan.x,
      panY: schematicPan.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!isPanning) return;
    const start = panStartRef.current;
    setSchematicPan({
      x: start.panX + event.clientX - start.x,
      y: start.panY + event.clientY - start.y
    });
  };

  const handlePointerUp = (event) => {
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const renderInteractiveSchematic = () => (
    <div className="schematic-stage">
      <div className="schematic-toolbar">
        <span className="schematic-toolbar-label"><Move size={12} /> Drag to pan · Wheel to zoom</span>
        <div className="schematic-toolbar-actions">
          <button onClick={() => setSchematicZoom(prev => clampZoom(prev - 0.15))} title="Zoom out">
            <ZoomOut size={13} />
          </button>
          <span>{Math.round(schematicZoom * 100)}%</span>
          <button onClick={() => setSchematicZoom(prev => clampZoom(prev + 0.15))} title="Zoom in">
            <ZoomIn size={13} />
          </button>
          <button onClick={resetSchematicView} title="Reset schematic view">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
      <div
        className={`schematic-viewport ${isPanning ? 'panning' : ''}`}
        onWheel={handleSchematicWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          className="schematic-canvas"
          style={{
            transform: `translate(${schematicPan.x}px, ${schematicPan.y}px) scale(${schematicZoom})`
          }}
        >
          {renderDomainSchematic()}
        </div>
      </div>
    </div>
  );

  const getMetricValue = (name, fallback = '-') => {
    return resultsData?.metrics?.find(m => m.name === name)?.value || fallback;
  };

  const renderSummaryText = (text = '') => {
    const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  const getRunModeLabel = () => {
    if (isStaticCircuit) return 'DC operating point';
    if (activeDomain === 'Physics') return resultsData?.spring_profile ? 'mechanics SHM' : 'mechanics';
    if (activeDomain === 'Circuits') return 'transient';
    if (activeDomain === 'Aerospace') return '1D isentropic';
    if (activeDomain === 'Thermal') return 'thermal budget';
    if (activeDomain === 'Control') return 'closed-loop estimate';
    if (activeDomain === 'Materials') return 'safety check';
    if (activeDomain === 'Power') return 'power balance';
    return 'static';
  };

  const isAnalyticalNoPlotResult = () => {
    const type = String(resultsData?.visualization_type || '');
    return type.includes('static') || type === 'pulley_static' || type === 'thermal_static' || type === 'control_static' || type === 'materials_static' || type === 'power_static';
  };

  const getNextSuggestions = () => {
    const systemType = String(modelData?.SYSTEM_TYPE || '').toLowerCase();
    if ((activeDomain === 'Structural' || activeDomain === 'Physics') && systemType.includes('spring') && systemType.includes('pulley')) {
      return [
        { label: 'Change spring stiffness', prompt: 'Set spring constant to 150 N/m and recalculate maximum extension and period' },
        { label: 'Reduce friction', prompt: 'Set coefficient of friction to 0.1 and compare the spring-pulley SHM results' },
        { label: 'Explain SHM', prompt: 'Explain why this spring-pulley system is simple harmonic motion' }
      ];
    }
    if (activeDomain === 'Physics' && (systemType.includes('pulley') || systemType.includes('block'))) {
      return [
        { label: 'Change friction', prompt: 'Set coefficient of friction to 0.1 and rerun the mechanics result' },
        { label: 'Change mass', prompt: 'Set mass m2 to 4 kg and recalculate acceleration and tension' },
        { label: 'Explain FBD', prompt: 'Explain each force in the free-body diagrams' }
      ];
    }
    if (activeDomain === 'Structural' && (systemType.includes('pulley') || systemType.includes('block'))) {
      return [
        { label: 'Change friction', prompt: 'Set coefficient of friction to 0.3 and rerun the pulley calculation' },
        { label: 'Change hanging mass', prompt: 'Set mass m2 to 4 kg and rerun acceleration, tension, and distance' },
        { label: 'Find stop time', prompt: 'How long will m2 take to travel 1 meter with the current pulley setup?' }
      ];
    }
    if (activeDomain === 'Circuits' && modelData?.SYSTEM_TYPE === 'Voltage Divider') {
      return [
        { label: 'Use closer values', prompt: 'Choose standard resistor values closer to 5V output with lower error' },
        { label: 'Reduce current draw', prompt: 'Increase divider resistor values to reduce current draw while keeping about 5V output' },
        { label: 'Add load effect', prompt: 'Add a 10 kOhm load to the voltage divider and recalculate output voltage' }
      ];
    }
    if (activeDomain === 'Circuits') {
      return [
        { label: 'Sweep capacitor value', prompt: 'Sweep capacitor value from 47uF to 220uF' },
        { label: 'Sweep load', prompt: 'Sweep load current to check transient bounds' },
        { label: 'Explore TRIZ solutions', prompt: 'Help me explore TRIZ principles for reducing inductor size', accent: true }
      ];
    }
    if (activeDomain === 'Structural') {
      return [
        { label: 'Try aluminum alloy', prompt: 'Try aluminum alloy compensation' },
        { label: 'Double load magnitude', prompt: 'Double the load magnitude to test structural limits' },
        { label: 'Explore TRIZ solutions', prompt: 'How does TRIZ solve weight vs strength bending?', accent: true }
      ];
    }
    if (activeDomain === 'Fluids') {
      return [
        { label: 'Try higher velocity', prompt: 'Try 2x higher inlet velocity to check boundary shear' },
        { label: 'Check shear stress', prompt: 'What is the wall shear stress at current Re?' },
        { label: 'Explore TRIZ solutions', prompt: 'Explore TRIZ solutions for pressure drop vs flow rate', accent: true }
      ];
    }
    if (activeDomain === 'Semiconductors') {
      return [
        { label: 'Sweep gate voltage', prompt: 'Sweep gate voltage to trace full transconductance' },
        { label: 'Try thinner oxide', prompt: 'Try a thinner gate oxide to increase current drive' },
        { label: 'Explore TRIZ solutions', prompt: 'Explore TRIZ principles for sub-100nm CMOS scaling', accent: true }
      ];
    }
    if (activeDomain === 'Aerospace' && (systemType.includes('wing') || resultsData?.wing_profile)) {
      return [
        { label: 'Change angle of attack', prompt: 'Set angle of attack to 8 degrees and rerun lift and induced drag' },
        { label: 'Increase wingspan', prompt: 'Increase wingspan to 2.5 m and compare lift distribution and induced drag' },
        { label: 'Check stall margin', prompt: 'Check whether the current NACA 4412 wing is near stall' }
      ];
    }
    if (activeDomain === 'Aerospace') {
      return [
        { label: 'Sweep chamber pressure', prompt: 'Sweep chamber pressure to optimize thrust profile' },
        { label: 'Increase expansion ratio', prompt: 'Increase expansion ratio to optimize vacuum performance' },
        { label: 'Explore TRIZ solutions', prompt: 'Explore TRIZ principles for thermal protection vs weight', accent: true }
      ];
    }
    if (activeDomain === 'Thermal') {
      return [
        { label: 'Try forced convection', prompt: 'Set convection coefficient to 50 W/m²K and rerun the thermal budget' },
        { label: 'Lower temperature limit', prompt: 'Set maximum junction temperature to 65 C and rerun' },
        { label: 'Reduce interface resistance', prompt: 'Set interface resistance to 0.2 K/W and compare required heatsink area' }
      ];
    }
    if (activeDomain === 'Control') {
      return [
        { label: 'Reduce overshoot', prompt: 'Set maximum overshoot to 5% and retune the PID controller' },
        { label: 'Faster settling', prompt: 'Set settling time to 0.5 s and retune the PID controller' },
        { label: 'Explain gains', prompt: 'Explain what Kp, Ki, and Kd are doing in this design' }
      ];
    }
    if (activeDomain === 'Materials') {
      return [
        { label: 'Increase stress range', prompt: 'Set maximum stress to 260 MPa and rerun fatigue safety' },
        { label: 'Try aluminum', prompt: 'Try aluminum alloy material properties and compare safety factor' },
        { label: 'Improve fatigue life', prompt: 'Suggest design changes to improve fatigue safety factor' }
      ];
    }
    if (activeDomain === 'Power') {
      return [
        { label: 'Change load current', prompt: 'Set secondary current to 15 A and rerun transformer power balance' },
        { label: 'Improve efficiency', prompt: 'Set efficiency to 98% and compare losses' },
        { label: 'Monthly energy cost', prompt: 'Calculate monthly energy loss cost if this transformer runs 8 hours per day at $0.15 per kWh' }
      ];
    }
    return [];
  };

  const renderStaticCircuitResult = () => {
    if (modelData?.SYSTEM_TYPE !== 'Voltage Divider') return null;

    const vin = modelData.INPUT?.['Input voltage']?.value || '12 V';
    const target = modelData.OUTPUT?.['Target voltage']?.value || '5 V';
    const r1 = modelData.COMPONENTS?.['Top resistor (R1)']?.value || '1.5 kΩ';
    const r2 = modelData.COMPONENTS?.['Bottom resistor (R2)']?.value || '1 kΩ';

    return (
      <div className="static-circuit-result">
        <div className="static-result-header">
          <div>
            <span>DC Operating Point</span>
            <small>Voltage divider analysis</small>
          </div>
          <strong>{getMetricValue('Output voltage', target)}</strong>
        </div>
        <div className="static-divider-preview">
          <span>{vin}</span>
          <span className="wire-segment" />
          <span className="resistor-chip">R1 {r1}</span>
          <span className="wire-segment" />
          <span className="node-chip">Vout {getMetricValue('Output voltage', target)}</span>
          <span className="wire-segment vertical" />
          <span className="resistor-chip">R2 {r2}</span>
          <span className="wire-segment vertical" />
          <span>GND</span>
        </div>
        <div className="static-result-grid">
          <div>
            <span>Current draw</span>
            <strong>{getMetricValue('Divider current', '-')}</strong>
          </div>
          <div>
            <span>Voltage error</span>
            <strong>{getMetricValue('Voltage error', '-')}</strong>
          </div>
          <div>
            <span>R1 power</span>
            <strong>{getMetricValue('R1 power', '-')}</strong>
          </div>
          <div>
            <span>R2 power</span>
            <strong>{getMetricValue('R2 power', '-')}</strong>
          </div>
        </div>
      </div>
    );
  };

  const handleExportJSON = () => {
    if (!resultsData || !modelData) return;
    const jsonContent = exportResultsToJSON(resultsData, modelData, activeDomain);
    downloadFile(jsonContent, `simforge_results_${activeDomain.toLowerCase()}_${Date.now()}.json`, 'application/json');
  };

  const handleExportCSV = () => {
    if (!resultsData) return;
    const csvContent = exportMetricsToCSV(resultsData);
    downloadFile(csvContent, `simforge_metrics_${activeDomain.toLowerCase()}_${Date.now()}.csv`, 'text/csv');
  };

  const handleExportHTML = () => {
    if (!resultsData || !modelData) return;
    const htmlContent = generateHTMLReport(resultsData, modelData, activeDomain);
    downloadFile(htmlContent, `simforge_report_${activeDomain.toLowerCase()}_${Date.now()}.html`, 'text/html');
  };

  // Tuning handlers
  const handleStartTuning = () => {
    if (!tuningTargetMetric) return;
    const tuningState = startTuningLoop(tuningTargetMetric, tuningDirection, 10);
    setTuningActive(true);
    setTuningState(tuningState);
  };

  const handleStopTuning = () => {
    stopTuningLoop();
    setTuningActive(false);
    const report = generateTuningReport();
    if (report.success) {
      console.log('Tuning report:', report);
    }
  };

  const handleCreateComparison = () => {
    if (!resultsData || !modelData || !onCreateComparison) return;
    // Store current results for comparison
    onCreateComparison(resultsData, modelData);
  };

  const handleSelectComparison = (comparisonId) => {
    const comparison = comparisons.find(c => c.id === comparisonId);
    if (comparison) {
      setActiveComparison(comparison);
      setResultsView('compare');
    }
  };

  return (
    <div className="results-pane flex flex-col flex-1 relative">
      {/* Pane Header */}
      <div className="pane-header flex items-center justify-between">
        {/* Tabs for results views */}
        <div className="flex gap-3">
          <button 
            className={`pane-tab ${resultsView === 'results' ? 'active' : ''}`}
            onClick={() => setResultsView('results')}
          >
            Results
          </button>
          <button 
            className={`pane-tab ${resultsView === 'schematic' ? 'active' : ''}`}
            onClick={() => setResultsView('schematic')}
          >
            Schematic
          </button>
          {runHistory && runHistory.length > 0 && (
            <button 
              className={`pane-tab ${resultsView === 'history' ? 'active' : ''}`}
              onClick={() => setResultsView('history')}
            >
              History
            </button>
          )}
          {comparisons.length > 0 && (
            <button 
              className={`pane-tab ${resultsView === 'compare' ? 'active' : ''}`}
              onClick={() => setResultsView('compare')}
            >
              <BarChart3 size={12} /> Compare
            </button>
          )}
        </div>

        {resultsState === 'results' && (
          <div className="flex items-center gap-2">
            <button className="header-btn" onClick={handleExportJSON} title="Export as JSON">
              <Download size={12} /> JSON
            </button>
            <button className="header-btn" onClick={handleExportCSV} title="Export metrics as CSV">
              <Download size={12} /> CSV
            </button>
            <button className="header-btn" onClick={handleExportHTML} title="Export as HTML report">
              <Download size={12} /> Report
            </button>
            <button 
              className={`header-btn ${tuningActive ? 'active' : ''}`} 
              onClick={tuningActive ? handleStopTuning : handleStartTuning}
              title="Parameter tuning"
            >
              {tuningActive ? <Pause size={12} /> : <Play size={12} />} 
              {tuningActive ? 'Stop' : 'Tune'}
            </button>
            <button className="header-btn" disabled title="Share (Disabled in Phase 1)">
              <Share2 size={12} /> Share
            </button>
          </div>
        )}
      </div>

      {/* Pane Body */}
      <div className="pane-body flex-1 flex flex-col overflow-y-auto">
        
        {/* STATE A: EMPTY - Before solver runs */}
        {!hasSolverRun && resultsView !== 'schematic' && (
          <div className="empty-state flex flex-col items-center justify-center flex-1">
            {isSimulationRunning ? (
              <>
                <div className="plot-spinner" />
                <span className="empty-state-text mt-3">
                  Solver running — generating plots...
                </span>
              </>
            ) : (
              <>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1">
                  <path d="M3 3v18h18" />
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
                <span className="empty-state-text mt-3">
                  Click "Confirm & Run Simulation" to generate plots
                </span>
              </>
            )}
          </div>
        )}

        {/* STATE A: EMPTY - After solver runs but no results */}
        {hasSolverRun && resultsState === 'empty' && resultsView !== 'schematic' && (
          <div className="empty-state flex flex-col items-center justify-center flex-1">
            {isSimulationRunning ? (
              <>
                <div className="plot-spinner" />
                <span className="empty-state-text mt-3">
                  Solver running — generating plots...
                </span>
              </>
            ) : (
              <>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1">
                  <path d="M3 3v18h18" />
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
                <span className="empty-state-text mt-3">
                  No results available from solver.
                </span>
              </>
            )}
          </div>
        )}

        {/* SCHEMATIC TAB VIEW */}
        {resultsView === 'schematic' && renderInteractiveSchematic()}

        {/* STATE B: DISPLAYING RESULTS */}
        {resultsState === 'results' && resultsData && resultsView === 'results' && (
          <div className="results-content flex-1 flex flex-col p-3">
            
            {/* Plain-Language summary box */}
            <div className="summary-box flex items-start gap-2 mb-3">
              <Info size={14} className="text-success mt-0.5" />
              <div>
                <p className="summary-text">
                  {renderSummaryText(resultsData.plain_summary)}
                </p>
                <span className="summary-meta">
                  ({resultsData.solver_metadata?.solver || getMetricValue('Solver', 'solver')} · {getRunModeLabel()})
                </span>
              </div>
            </div>

            {/* Tuning control panel */}
            {tuningActive && (
              <div className="tuning-panel flex items-center gap-3 mb-3 p-3 bg-[#0D1117] border border-[#252A32] rounded-lg">
                <Settings size={14} className="text-primary" />
                <div className="flex-1">
                  <span className="text-[11px] font-bold text-primary">Parameter Tuning Active</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted">Target:</span>
                    <input 
                      type="text" 
                      value={tuningTargetMetric}
                      onChange={(e) => setTuningTargetMetric(e.target.value)}
                      className="text-[10px] bg-[#13161A] border border-[#252A32] rounded px-2 py-1 text-primary w-32"
                      placeholder="e.g., Output voltage"
                    />
                    <select 
                      value={tuningDirection}
                      onChange={(e) => setTuningDirection(e.target.value)}
                      className="text-[10px] bg-[#13161A] border border-[#252A32] rounded px-2 py-1 text-primary"
                    >
                      <option value="maximize">Maximize</option>
                      <option value="minimize">Minimize</option>
                    </select>
                  </div>
                </div>
                {tuningState && (
                  <div className="text-[10px] text-muted">
                    Iteration: {tuningState.currentIteration}/{tuningState.maxIterations}
                  </div>
                )}
              </div>
            )}

            {/* Dynamic plot tabs based on available plots from enhanced parsers */}
            {plotConfigs.length > 1 && (
              <div className="sub-tabs flex gap-2 mb-2 flex-wrap">
                {plotConfigs.map((plot, idx) => (
                  <button
                    key={plot.id || idx}
                    className={`sub-tab-btn ${currentPlot?.id === plot.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab(plot.title);
                      setCurrentPlot(plot);
                      Plotly.newPlot(
                        chartRef.current,
                        plot.traces,
                        plot.layout,
                        {
                          displayModeBar: true,
                          displaylogo: false,
                          modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
                          responsive: true,
                        }
                      );
                    }}
                  >
                    {plot.title}
                  </button>
                ))}
              </div>
            )}

            {/* Legacy sub-tabs for time-series circuits (fallback if no dynamic plots) */}
            {activeDomain === 'Circuits' && !isStaticCircuit && plotConfigs.length <= 1 && (
              <div className="sub-tabs flex gap-2 mb-2">
                {['Time Domain', 'Frequency Domain'].map(t => (
                  <button
                    key={t}
                    className={`sub-tab-btn ${activeTab === t ? 'active' : ''}`}
                    onClick={() => setActiveTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Supplemental SVG plots from brain */}
            {svgPlots && svgPlots.length > 0 && (
              <div className="svg-plots-container flex flex-col gap-3 mb-3">
                {svgPlots.map((svg, i) => (
                  <div 
                    key={i}
                    className="p-4 bg-[#0D0F12] border border-[#252A32] rounded-lg"
                    dangerouslySetInnerHTML={{ __html: svg }}
                    style={{ width: '100%', maxWidth: '400px' }}
                  />
                ))}
              </div>
            )}

            {/* Sub-tabs for Aerospace profiles */}
            {activeDomain === 'Aerospace' && (
              <div className="sub-tabs flex gap-2 mb-2">
                {(resultsData?.wing_profile
                  ? ['Lift Distribution', 'Local CL']
                  : ['Mach Number', 'Pressure Ratio', 'Temperature Ratio']
                ).map(t => (
                  <button
                    key={t}
                    className={`sub-tab-btn ${activeTab === t ? 'active' : ''}`}
                    onClick={() => setActiveTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {(activeDomain === 'Structural' || activeDomain === 'Physics') && resultsData?.spring_profile && (
              <div className="sub-tabs flex gap-2 mb-2">
                {['Displacement', 'Velocity', 'Acceleration'].map(t => (
                  <button
                    key={t}
                    className={`sub-tab-btn ${activeTab === t ? 'active' : ''}`}
                    onClick={() => setActiveTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Plotly Chart area (Circuits, Semiconductors, Aerospace) or Canvas Field Map (Structural, Fluids) */}
            <div className="chart-view-area mb-3 flex items-center justify-center">
              {resultsData.visualization_type === 'circuit_static' ? (
                <div className="static-plot-wrap">
                  {renderStaticCircuitResult()}
                  <div className="plot-status-note">{getNoPlotMessage()}</div>
                </div>
              ) : (activeDomain === 'Circuits' || activeDomain === 'Semiconductors' || activeDomain === 'Aerospace' || ((activeDomain === 'Structural' || activeDomain === 'Physics') && resultsData?.spring_profile) || (activeDomain === 'Physics' && resultsData?.wave_profile)) ? (
                <div className="plot-shell">
                  <div ref={chartRef} style={{ width: '100%', height: '240px', opacity: plotStatus === 'ready' ? 1 : 0.24 }} />
                  {(plotStatus === 'loading' || isPlotLoading) && (
                    <div className="plot-overlay">
                      <div className="plot-spinner" />
                      <span>Rendering plot...</span>
                    </div>
                  )}
                  {plotStatus === 'no-plot' && !isPlotLoading && (
                    <div className="plot-overlay">
                      <span className="plot-empty-title">No plot generated</span>
                      <p>{getNoPlotMessage()}</p>
                    </div>
                  )}
                </div>
              ) : isAnalyticalNoPlotResult() ? (
                <div className="plot-shell">
                  <div className="plot-overlay">
                    <span className="plot-empty-title">No plot generated</span>
                    <p>{getNoPlotMessage()}</p>
                  </div>
                </div>
              ) : (
                <div className="plot-shell">
                  <canvas 
                    ref={canvasRef} 
                    width={340} 
                    height={180} 
                    style={{ width: '100%', height: '180px', border: '1px solid var(--border)', borderRadius: '4px', opacity: plotStatus === 'ready' ? 1 : 0.24 }}
                  />
                  {(plotStatus === 'loading' || isPlotLoading) && (
                    <div className="plot-overlay">
                      <div className="plot-spinner" />
                      <span>Rendering field map...</span>
                    </div>
                  )}
                  {plotStatus === 'no-plot' && !isPlotLoading && (
                    <div className="plot-overlay">
                      <span className="plot-empty-title">No plot generated</span>
                      <p>{getNoPlotMessage()}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Key Metrics table */}
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

            {/* Suggestions Chips ("What's next?") */}
            <div className="suggestions-section mt-4">
              <span className="section-label">TRY NEXT</span>
              <div className="divider-line" />
              
              <div className="chips-container flex gap-2 flex-wrap mt-2">
                {getNextSuggestions().map(suggestion => (
                  <button
                    key={suggestion.label}
                    className={`chip-btn ${suggestion.accent ? 'text-amber border-amber' : ''}`}
                    onClick={() => onSelectSuggestion(suggestion.prompt)}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* RESULTS TAB: HISTORY VIEW */}
        {resultsView === 'history' && runHistory && (
          <div className="history-tab-content p-3 flex flex-col gap-3">
            <span className="section-label">PAST RUNS IN THIS SESSION</span>
            <div className="divider-line" />
            
            <div className="history-runs-list flex flex-col gap-2">
              {runHistory.map((run, idx) => (
                <div key={idx} className="history-run-card flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="run-card-time">{run.timestamp}</span>
                    <span className="run-card-desc truncate">{run.description}</span>
                  </div>
                  <button 
                    className="compare-btn text-accent"
                    onClick={() => {
                      setSelectedHistoricalRun(run);
                      setResultsView('compare');
                    }}
                  >
                    Compare
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS TAB: COMPARE VIEW */}
        {resultsView === 'compare' && activeComparison && (
          <div className="compare-layout p-3 flex flex-col">
            <div className="compare-header flex justify-between items-center mb-2">
              <span className="section-label text-accent">RESULT COMPARISON</span>
              <button className="compare-close" onClick={() => setResultsView('results')}>
                Close
              </button>
            </div>
            
            <div className="compare-summary mb-3 p-2 bg-[#0D1117] border border-[#252A32] rounded">
              <div className="flex items-center gap-4">
                <span className={`text-[11px] font-bold ${activeComparison.analysis?.improved ? 'text-success' : 'text-danger'}`}>
                  Overall: {activeComparison.analysis?.improved ? 'Improved' : 'Degraded'}
                </span>
                <span className="text-[10px] text-muted">
                  {activeComparison.analysis?.metrics?.filter(m => m.improved).length} improved, 
                  {activeComparison.analysis?.metrics?.filter(m => !m.improved && m.change !== 0).length} degraded
                </span>
              </div>
            </div>
            
            <div className="compare-columns flex gap-2 flex-1">
              <div className="compare-col flex flex-col flex-1">
                <span className="compare-col-header">UPDATED RUN</span>
                <div className="compare-metrics-box">
                  {activeComparison.comparisonResults?.metrics?.map(m => (
                    <div key={m.name} className="compare-metric-row flex justify-between">
                      <span>{m.name}</span>
                      <span className="font-semibold">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="compare-col flex flex-col flex-1">
                <span className="compare-col-header text-amber">BASE RUN</span>
                <div className="compare-metrics-box border-amber/30">
                  {activeComparison.baseResults?.metrics?.map(m => (
                    <div key={m.name} className="compare-metric-row flex justify-between">
                      <span>{m.name}</span>
                      <span className="font-semibold">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Numerical diffing calculation */}
            <div className="diff-calculator mt-4 bg-base border border-[#252A32] p-2 rounded">
              <span className="section-label">METRIC CHANGES</span>
              <div className="divider-line" />
              <div className="flex flex-col gap-1 mt-1 font-mono text-[11px]">
                {activeComparison.analysis?.metrics?.map(m => (
                  <div key={m.name} className={`flex justify-between ${m.improved ? 'text-success' : 'text-danger'}`}>
                    <span>{m.name}</span>
                    <span>
                      {m.oldValue} → {m.newValue} ({m.percentChange > 0 ? '+' : ''}{m.percentChange.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      <style>{`
        .results-pane {
          background-color: var(--bg-surface);
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .results-pane .pane-header {
          flex-shrink: 0;
        }
        .results-pane .pane-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow-y: auto;
        }
        .pane-tab {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
          padding: 8px 0;
          margin-right: 16px;
        }
        .pane-tab.active {
          color: var(--text-primary);
          border-bottom: 2px solid var(--accent-primary);
        }
        .header-btn {
          font-size: 11px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--border);
          padding: 2px 8px;
          border-radius: 4px;
        }
        .header-btn:hover {
          color: var(--text-primary);
          border-color: var(--text-secondary);
        }
        
        .empty-state {
          text-align: center;
          padding: 24px;
        }
        .empty-state-text {
          font-size: 12px;
          color: var(--text-muted);
        }
        
        /* Summary Box */
        .summary-box {
          background-color: #0D1117;
          border-left: 3px solid var(--success);
          padding: 8px 12px;
          border-radius: 0 4px 4px 0;
        }
        .summary-text {
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-primary);
        }
        .summary-meta {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 4px;
          display: block;
        }
        
        /* Sub tabs */
        .sub-tabs {
          border-bottom: 1px solid var(--border);
        }
        .sub-tab-btn {
          font-size: 11px;
          color: var(--text-secondary);
          padding: 4px 8px;
        }
        .sub-tab-btn.active {
          color: var(--accent-primary);
          font-weight: 500;
        }
        
        .chart-view-area {
          min-height: 180px;
          background-color: #0D0F12;
          border-radius: 4px;
          overflow: hidden;
          border: 1px solid rgba(37, 42, 50, 0.75);
          position: relative;
        }
        .schematic-stage {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #0D0F12;
        }
        .schematic-toolbar {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }
        .schematic-toolbar-label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-size: 11px;
        }
        .schematic-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .schematic-toolbar-actions button {
          width: 24px;
          height: 24px;
          border: 1px solid var(--border);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          background: var(--bg-base);
        }
        .schematic-toolbar-actions button:hover {
          color: var(--text-primary);
          border-color: var(--accent-primary);
        }
        .schematic-viewport {
          flex: 1;
          min-height: 360px;
          overflow: hidden;
          cursor: grab;
          touch-action: none;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            linear-gradient(rgba(37, 42, 50, 0.22) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37, 42, 50, 0.22) 1px, transparent 1px),
            #0D0F12;
          background-size: 24px 24px;
        }
        .schematic-viewport.panning {
          cursor: grabbing;
        }
        .schematic-canvas {
          transform-origin: center center;
          transition: transform 80ms ease-out;
          will-change: transform;
          min-width: 380px;
          min-height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .schematic-canvas > div {
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
        }
        .plot-shell {
          position: relative;
          width: 100%;
          min-height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .plot-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 18px;
          text-align: center;
          background: rgba(13, 15, 18, 0.82);
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }
        .plot-overlay p {
          max-width: 320px;
          color: var(--text-muted);
          margin: 0;
        }
        .plot-empty-title {
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .plot-spinner {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid rgba(59, 130, 246, 0.18);
          border-top-color: var(--accent-primary);
          animation: plotSpin 0.85s linear infinite;
        }
        @keyframes plotSpin {
          to { transform: rotate(360deg); }
        }
        .static-plot-wrap {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px;
        }
        .plot-status-note {
          border: 1px dashed var(--border);
          border-radius: 5px;
          padding: 8px;
          color: var(--text-muted);
          background: rgba(19, 22, 26, 0.72);
          font-size: 11px;
          line-height: 1.4;
        }
        .static-circuit-result {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: linear-gradient(180deg, rgba(28, 32, 38, 0.8), var(--bg-base));
          padding: 12px;
        }
        .static-result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
          color: var(--text-secondary);
          font-size: 12px;
        }
        .static-result-header div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .static-result-header small {
          color: var(--text-muted);
          font-size: 10px;
        }
        .static-result-header strong {
          color: var(--success);
          font-family: var(--font-mono);
          font-size: 20px;
        }
        .static-divider-preview {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          min-height: 58px;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .wire-segment {
          width: 18px;
          height: 1px;
          background: var(--text-muted);
          opacity: 0.7;
        }
        .wire-segment.vertical {
          width: 1px;
          height: 18px;
        }
        .resistor-chip,
        .node-chip {
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 5px 7px;
          background: var(--bg-elevated);
        }
        .node-chip {
          color: var(--success);
          border-color: rgba(34, 197, 94, 0.38);
          background: rgba(34, 197, 94, 0.08);
          font-weight: 700;
        }
        .static-result-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .static-result-grid div {
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 8px;
          background: var(--bg-surface);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .static-result-grid span {
          color: var(--text-muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .static-result-grid strong {
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 12px;
        }
        
        /* Metrics table */
        .section-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .metrics-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 4px 0;
        }
        .metric-row {
          font-size: 13px;
        }
        .metric-name {
          color: var(--text-secondary);
        }
        .metric-value {
          color: var(--text-primary);
          font-weight: 500;
        }
        
        .chip-btn {
          border: 1px solid var(--border);
          color: var(--text-secondary);
          background-color: transparent;
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 11px;
        }
        .chip-btn:hover {
          border-color: var(--accent-primary);
          color: var(--text-primary);
        }
        .chip-btn.border-amber {
          border-color: var(--accent-secondary);
          color: var(--accent-secondary);
        }
        .chip-btn.border-amber:hover {
          background-color: #1A1500;
        }
        
        /* Run History cards */
        .history-run-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          padding: 10px;
          border-radius: 4px;
        }
        .run-card-time {
          font-size: 10px;
          color: var(--text-muted);
        }
        .run-card-desc {
          font-size: 12px;
          color: var(--text-primary);
          margin-top: 2px;
        }
        .compare-btn {
          font-size: 11px;
        }
        
        /* Side by side comparison */
        .compare-col {
          border: 1px solid var(--border);
          border-radius: 4px;
          background-color: var(--bg-base);
          padding: 8px;
        }
        .compare-col-header {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 6px;
          display: block;
        }
        .compare-metrics-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .compare-metric-row {
          font-size: 11px;
          border-bottom: 1px dashed var(--border);
          padding-bottom: 4px;
        }
        .compare-close {
          font-size: 11px;
          color: var(--error);
        }
      `}</style>
    </div>
  );
}
