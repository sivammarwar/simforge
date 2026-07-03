/**
 * plotEngine.js — Universal Plotly Config Generator
 * Returns an array of { id, title, traces, layout, config } objects.
 * Each entry = one Plotly chart tab.
 * Zero new dependencies — uses the existing plotly.js-dist-min.
 */

// ─── Shared dark theme ─────────────────────────────────────────
const DARK = {
  paper_bgcolor: '#0D0F12',
  plot_bgcolor:  '#13161A',
  font:          { family: 'JetBrains Mono, monospace', color: '#E8EAF0', size: 11 },
  xaxis: {
    gridcolor: '#252A32', zerolinecolor: '#3B3F4A',
    tickfont:  { family: 'JetBrains Mono, monospace', color: '#8C929E', size: 10 },
    titlefont: { family: 'JetBrains Mono, monospace', color: '#B0B7C3', size: 11 },
  },
  yaxis: {
    gridcolor: '#252A32', zerolinecolor: '#3B3F4A',
    tickfont:  { family: 'JetBrains Mono, monospace', color: '#8C929E', size: 10 },
    titlefont: { family: 'JetBrains Mono, monospace', color: '#B0B7C3', size: 11 },
  },
  margin:  { t: 40, r: 20, b: 50, l: 60 },
  legend:  { bgcolor: '#1C2026', bordercolor: '#252A32', font: { color: '#E8EAF0', size: 10 } },
  hoverlabel: { bgcolor: '#1C2026', bordercolor: '#3B82F6', font: { family: 'JetBrains Mono, monospace', size: 11 } },
};

function layout(title, extra = {}) {
  return { ...DARK, title: { text: title, font: { size: 13, color: '#E8EAF0', family: 'JetBrains Mono, monospace' } }, ...extra };
}

const CFG = { displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ['autoScale2d','hoverClosestCartesian','hoverCompareCartesian','toggleSpikelines'], responsive: true };

// ─── Utility ───────────────────────────────────────────────────
function linspace(a, b, n) {
  return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)));
}

function pu(s) { return parseFloat(String(s || 0)) || 0; }

// ─── Main export ───────────────────────────────────────────────
/**
 * @param {object} resultsData  – solver output
 * @param {string} domain       – active domain name
 * @param {object} modelData    – model parameters
 * @returns {Array<{id,title,traces,layout,config}>}
 */
export function getPlots(resultsData, domain, modelData = {}) {
  if (!resultsData) return [];
  const plots = [];

  try {
    switch (domain) {
      case 'Circuits':       circuitPlots(resultsData, modelData, plots); break;
      case 'Structural':     structuralPlots(resultsData, modelData, plots); break;
      case 'Physics':        physicsPlots(resultsData, modelData, plots); break;
      case 'Thermal':        thermalPlots(resultsData, modelData, plots); break;
      case 'Aerospace':      aerospacePlots(resultsData, modelData, plots); break;
      case 'Control':        controlPlots(resultsData, modelData, plots); break;
      case 'Materials':      materialsPlots(resultsData, modelData, plots); break;
      case 'Power':          powerPlots(resultsData, modelData, plots); break;
      case 'Fluids':         fluidPlots(resultsData, modelData, plots); break;
      case 'Semiconductors': semiconductorPlots(resultsData, modelData, plots); break;
    }
  } catch (e) { /* silent fail — return whatever was built */ }

  return plots;
}

// ═══════════════════════════════════════════════════════════════
// CIRCUITS
// ═══════════════════════════════════════════════════════════════
function circuitPlots(rd, md, plots) {
  console.log('[plotEngine] circuitPlots called with data keys:', Object.keys(rd));
  
  // Check for pre-built Plotly data from enhanced parser
  if (rd.plotly_data && Array.isArray(rd.plotly_data) && rd.plotly_data.length > 0) {
    console.log('[plotEngine] Using pre-built plotly_data from parser');
    
    // Group traces by yaxis for proper layout
    const tracesByYaxis = {};
    rd.plotly_data.forEach(trace => {
      const yaxis = trace.yaxis || 'y';
      if (!tracesByYaxis[yaxis]) tracesByYaxis[yaxis] = [];
      tracesByYaxis[yaxis].push(trace);
    });
    
    // Build layout with multiple yaxes if needed
    const layoutExtra = {
      xaxis: { ...DARK.xaxis, title: rd.visualization_type === 'frequency_response' ? 'Frequency (Hz)' : 'Time (s)' }
    };
    
    if (tracesByYaxis.y2) {
      layoutExtra.yaxis2 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'Current (A)',
        tickfont: { color: '#F59E0B', size: 10 },
        color: '#F59E0B'
      };
    }
    if (tracesByYaxis.y3) {
      layoutExtra.yaxis3 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'Phase (°)',
        tickfont: { color: '#A855F7', size: 10 },
        color: '#A855F7'
      };
    }
    
    plots.push({
      id: rd.visualization_type || 'circuit_plot',
      title: rd.visualization_type === 'frequency_response' ? 'Frequency Response' : 'Transient Waveform',
      traces: rd.plotly_data,
      layout: layout(rd.visualization_type === 'frequency_response' ? 'Bode Response' : 'Circuit Waveform', layoutExtra),
      config: CFG
    });
    
    return;
  }
  
  // Check for transient waveform data (standardized field: time_series)
  if (rd.time_series && Array.isArray(rd.time_series.t) && rd.time_series.t.length > 0) {
    const t = rd.time_series.t;
    const Vc = rd.time_series.Vc || []; // Output voltage (standard field name)
    const Il = rd.time_series.Il || []; // Inductor current (optional)
    
    console.log('[plotEngine] Found time_series data:', { tLength: t.length, VcLength: Vc.length, IlLength: Il.length });
    
    // Verify data arrays match
    if (Vc.length === t.length && Vc.length > 1) {
      const traces = [
        {
          x: t,
          y: Vc,
          type: 'scatter',
          mode: 'lines',
          name: 'V_out',
          line: { color: '#3B82F6', width: 2 }
        }
      ];
      
      // Add current trace if available
      if (Il.length === t.length && Il.length > 0) {
        traces.push({
          x: t,
          y: Il,
          type: 'scatter',
          mode: 'lines',
          name: 'I_L',
          line: { color: '#F59E0B', width: 2 },
          yaxis: 'y2'
        });
      }
      
      plots.push({
        id: 'transient',
        title: 'Transient Waveform',
        traces,
        layout: layout('Transient — V(t)', {
          xaxis: { ...DARK.xaxis, title: 'Time (s)' },
          yaxis: { ...DARK.yaxis, title: 'Voltage (V)' },
          ...(Il.length > 0 && { yaxis2: { ...DARK.yaxis, overlaying: 'y', side: 'right', title: 'Current (A)' } })
        }),
        config: CFG
      });
      
      console.log('[plotEngine] Generated transient plot');
      return; // Successfully generated plot, don't fall through to synthetic
    }
  }
  
  // Check for frequency response data (standardized field: frequency_response)
  if (rd.frequency_response && Array.isArray(rd.frequency_response.freq)) {
    const freq = rd.frequency_response.freq;
    const mag = rd.frequency_response.mag || [];
    const phase = rd.frequency_response.phase || [];
    
    console.log('[plotEngine] Found frequency_response data:', { freqLength: freq.length, magLength: mag.length, phaseLength: phase.length });
    
    if (freq.length > 0 && mag.length === freq.length) {
      plots.push({
        id: 'bode_mag',
        title: 'Bode — Magnitude',
        traces: [{ x: freq, y: mag, type: 'scatter', mode: 'lines', name: '|H(jω)|', line: { color: '#22C55E', width: 2 } }],
        layout: layout('Bode — Magnitude', {
          xaxis: { ...DARK.xaxis, title: 'Frequency (Hz)', type: 'log' },
          yaxis: { ...DARK.yaxis, title: 'Magnitude (dB)' }
        }),
        config: CFG
      });
      
      console.log('[plotEngine] Generated Bode magnitude plot');
      
      if (phase.length === freq.length) {
        plots.push({
          id: 'bode_phase',
          title: 'Bode — Phase',
          traces: [{ x: freq, y: phase, type: 'scatter', mode: 'lines', name: '∠H(jω)', line: { color: '#F59E0B', width: 2 } }],
          layout: layout('Bode — Phase', {
            xaxis: { ...DARK.xaxis, title: 'Frequency (Hz)', type: 'log' },
            yaxis: { ...DARK.yaxis, title: 'Phase (°)' }
          }),
          config: CFG
        });
        
        console.log('[plotEngine] Generated Bode phase plot');
      }
      
      return; // Successfully generated plots, don't fall through
    }
  }
  
  console.log('[plotEngine] No time_series or frequency_response data found, falling through to DC analysis');
  
  // DC static analysis (no transient data, just metrics)
  if (rd.metrics && Array.isArray(rd.metrics) && rd.metrics.length > 0) {
    const vout = rd.metrics.find(m => m.name.toLowerCase().includes('output voltage'))?.value || 0;
    const vin = parseFloat(md.INPUT?.['Supply voltage']?.value) || 12;
    
    plots.push({
      id: 'dc_bar',
      title: 'DC Operating Point',
      traces: [{
        x: ['V_in', 'V_out'],
        y: [vin, parseFloat(vout)],
        type: 'bar',
        marker: { color: ['#3B82F6', '#22C55E'] }
      }],
      layout: layout('DC Voltage Distribution', {
        xaxis: { ...DARK.xaxis, title: 'Node' },
        yaxis: { ...DARK.yaxis, title: 'Voltage (V)' }
      }),
      config: CFG
    });
    
    // Add metrics table
    const metricsText = rd.metrics.map(m => `${m.name}: ${m.value}`).join('<br>');
    plots.push({
      id: 'metrics_table',
      title: 'Simulation Metrics',
      traces: [{
        type: 'table',
        header: { values: ['Metric', 'Value'] },
        cells: { 
          values: [
            rd.metrics.map(m => m.name),
            rd.metrics.map(m => String(m.value))
          ]
        }
      }],
      layout: layout('Results Summary'),
      config: CFG
    });
    
    return;
  }
  
  // No plots could be generated from available data
  console.warn(`[plotEngine] No plot data found for domain=Circuits, visualization_type=${rd.visualization_type}`);
}

function _buildSyntheticCircuitPlots(md, rd, sys, plots) {
  // Extract parameters for synthetic data
  const getM = (name, fb) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);

  if (sys.includes('voltage divider')) {
    // DC operating point bar chart
    const vin  = getM('Supply voltage', md.INPUT?.['Supply voltage']?.value) || 12;
    const vout = getM('Output voltage', '5');
    const err  = getM('Error', '0.2');
    plots.push({ id: 'dc_bar', title: 'DC Operating Point', traces: [{
      x: ['V_in', 'V_out', 'V_R1', 'V_R2'],
      y: [vin, vout, vin - vout, vout],
      type: 'bar', marker: { color: ['#3B82F6','#22C55E','#F59E0B','#A855F7'] }
    }], layout: layout('DC Voltage Distribution', { xaxis: { ...DARK.xaxis, title: 'Node' }, yaxis: { ...DARK.yaxis, title: 'Voltage (V)' } }), config: CFG });

    // Synthetic Bode for divider (it's a DC divider so just show attenuation)
    const freq = linspace(1, 5, 100).map(v => Math.pow(10, v));
    const atten = getM('Output voltage', '5') / (vin || 12);
    plots.push({ id: 'dc_sensitivity', title: 'Load Sensitivity', traces: [{
      x: [0, 1, 5, 10, 50, 100, 500],
      y: [atten * vin, atten * vin * 0.99, atten * vin * 0.97, atten * vin * 0.95, atten * vin * 0.9, atten * vin * 0.85, atten * vin * 0.7],
      type: 'scatter', mode: 'lines+markers', name: 'V_out vs R_load (kΩ)', line: { color: '#22C55E', width: 2 }
    }], layout: layout('Output vs Load Resistance', { xaxis: { ...DARK.xaxis, title: 'Load Resistance (kΩ)' }, yaxis: { ...DARK.yaxis, title: 'V_out (V)' } }), config: CFG });
    return;
  }

  if (sys.includes('buck')) {
    // Buck ripple waveform (synthetic sawtooth on top of DC)
    const vout = getM('Output voltage (avg)', '–') || 2.5;
    const t = linspace(0, 10e-6, 200);
    const fsw = 500e3;
    const vc = t.map(ti => vout + 0.05 * (2 * ((ti * fsw) % 1) - 1));
    const il = t.map(ti => 2 + 0.2 * (2 * ((ti * fsw) % 1) - 1));
    plots.push({ id: 'transient', title: 'Output Ripple', traces: [
      { x: t.map(v => v * 1e6), y: vc, type: 'scatter', mode: 'lines', name: 'V_out', line: { color: '#3B82F6', width: 2 } },
      { x: t.map(v => v * 1e6), y: il, type: 'scatter', mode: 'lines', name: 'I_L (A)', line: { color: '#F59E0B', width: 2 }, yaxis: 'y2' }
    ], layout: layout('Buck Converter — Output Ripple', {
      xaxis: { ...DARK.xaxis, title: 'Time (µs)' }, yaxis: { ...DARK.yaxis, title: 'V_out (V)' },
      yaxis2: { title: 'I_L (A)', overlaying: 'y', side: 'right', gridcolor: '#252A32', tickfont: { color: '#F59E0B', size: 10 }, color: '#F59E0B' }
    }), config: CFG });
    return;
  }

  // Generic RC filter Bode
  const r = getM('Top resistor (R1)', md.COMPONENTS?.['Top resistor (R1)']?.value) || 1600;
  const c = 100e-9;
  const fc = 1 / (2 * Math.PI * r * c);
  const freqs = linspace(1, 6, 200).map(v => Math.pow(10, v));
  const mag   = freqs.map(f => 20 * Math.log10(1 / Math.sqrt(1 + Math.pow(f / fc, 2))));
  const phase_= freqs.map(f => -Math.atan(f / fc) * 180 / Math.PI);
  plots.push({ id: 'bode_mag', title: 'Bode — Magnitude', traces: [
    { x: freqs, y: mag, type: 'scatter', mode: 'lines', name: '|H(f)|', line: { color: '#22C55E', width: 2 } },
    { x: [fc, fc], y: [-80, 5], type: 'scatter', mode: 'lines', name: 'fc', line: { color: '#EF4444', width: 1.5, dash: 'dot' } }
  ], layout: layout('Bode — Magnitude (RC Filter)', { xaxis: { ...DARK.xaxis, title: 'Frequency (Hz)', type: 'log' }, yaxis: { ...DARK.yaxis, title: '|H| (dB)' } }), config: CFG });

  plots.push({ id: 'bode_phase', title: 'Bode — Phase', traces: [
    { x: freqs, y: phase_, type: 'scatter', mode: 'lines', name: '∠H(f)', line: { color: '#F59E0B', width: 2 } }
  ], layout: layout('Bode — Phase (RC Filter)', { xaxis: { ...DARK.xaxis, title: 'Frequency (Hz)', type: 'log' }, yaxis: { ...DARK.yaxis, title: 'Phase (°)' } }), config: CFG });
}

// ═══════════════════════════════════════════════════════════════
// STRUCTURAL
// ═══════════════════════════════════════════════════════════════
function structuralPlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);

  // Check for pre-built Plotly data from enhanced parser
  if (rd.plotly_data && Array.isArray(rd.plotly_data) && rd.plotly_data.length > 0) {
    console.log('[plotEngine] Using pre-built plotly_data from structural parser');
    
    // Handle 3D scatter plots for stress distribution
    const has3D = rd.plotly_data.some(t => t.type === 'scatter3d');
    
    if (has3D) {
      rd.plotly_data.forEach((trace, idx) => {
        plots.push({
          id: `structural_3d_${idx}`,
          title: trace.name || '3D Stress Distribution',
          traces: [trace],
          layout: layout(trace.name || '3D Visualization', {
            scene: {
              xaxis: { title: 'X (m)', gridcolor: '#252A32', tickfont: { color: '#8C929E' } },
              yaxis: { title: 'Y (m)', gridcolor: '#252A32', tickfont: { color: '#8C929E' } },
              zaxis: { title: 'Z (m)', gridcolor: '#252A32', tickfont: { color: '#8C929E' } },
              bgcolor: '#13161A'
            }
          }),
          config: CFG
        });
      });
    } else {
      // Handle 2D plots
      plots.push({
        id: 'structural_plot',
        title: 'Structural Analysis',
        traces: rd.plotly_data,
        layout: layout('Structural Results'),
        config: CFG
      });
    }
    
    // Add metrics table
    if (rd.metrics && rd.metrics.length > 0) {
      plots.push({
        id: 'structural_metrics',
        title: 'FEA Metrics',
        traces: [{
          type: 'table',
          header: { values: ['Metric', 'Value', 'Unit'] },
          cells: { 
            values: [
              rd.metrics.map(m => m.name),
              rd.metrics.map(m => String(m.value)),
              rd.metrics.map(m => m.unit || '')
            ]
          }
        }],
        layout: layout('FEA Analysis Summary'),
        config: CFG
      });
    }
    
    return;
  }

  // ─── Stress heatmap (Plotly replaces Canvas) ─────────────────
  if (rd.contour_field && rd.contour_field.stress_mpa) {
    const stress = rd.contour_field.stress_mpa;
    const x = rd.contour_field.x || Array.from({ length: Math.sqrt(stress.length) }, (_, i) => i);
    const y = rd.contour_field.y || Array.from({ length: Math.sqrt(stress.length) }, (_, i) => i);
    
    plots.push({ id: 'stress_map', title: 'Von Mises Stress Map', traces: [{
      z: stress, x, y, type: 'heatmap',
      colorscale: [[0,'#0D0F12'],[0.25,'#1E3A8A'],[0.5,'#3B82F6'],[0.75,'#F59E0B'],[1,'#EF4444']],
      colorbar: { title: 'σ_vm (MPa)', tickfont: { color: '#8C929E', size: 10 } }
    }], layout: layout('Von Mises Stress Field', { xaxis: { ...DARK.xaxis, title: 'x (m)' }, yaxis: { ...DARK.yaxis, title: 'y (m)' } }), config: CFG });
  } else if (rd.stress_field && rd.stress_field.z) {
    plots.push({ id: 'stress_map', title: 'Von Mises Stress Map', traces: [{
      z: rd.stress_field.z, type: 'heatmap',
      colorscale: [[0,'#0D0F12'],[0.25,'#1E3A8A'],[0.5,'#3B82F6'],[0.75,'#F59E0B'],[1,'#EF4444']],
      colorbar: { title: 'σ_vm (MPa)', tickfont: { color: '#8C929E', size: 10 } }
    }], layout: layout('Von Mises Stress Field', { xaxis: { ...DARK.xaxis, title: 'x-node' }, yaxis: { ...DARK.yaxis, title: 'y-node' } }), config: CFG });
  } else {
    // Synthetic 2D stress heatmap
    const nx = 20, ny = 8;
    const z = Array.from({ length: ny }, (_, j) =>
      Array.from({ length: nx }, (_, i) => {
        const x_norm = i / (nx - 1);
        const y_norm = (j - ny/2) / (ny/2);
        const maxSigma = getM('Maximum bending stress', '250');
        return maxSigma * x_norm * Math.abs(y_norm) * (1 + 0.3 * Math.random());
      })
    );
    plots.push({ id: 'stress_map', title: 'Von Mises Stress Map', traces: [{
      z, type: 'heatmap',
      colorscale: [[0,'#13161A'],[0.2,'#1E3A8A'],[0.5,'#3B82F6'],[0.75,'#F59E0B'],[1,'#EF4444']],
      colorbar: { title: 'σ_vm (MPa)', tickfont: { color: '#8C929E', size: 10 } }
    }], layout: layout('Von Mises Stress Distribution', { xaxis: { ...DARK.xaxis, title: 'Beam position →' }, yaxis: { ...DARK.yaxis, title: 'Cross-section height' } }), config: CFG });
  }

  // ─── Deflection profile ──────────────────────────────────────
  if (rd.contour_field && rd.contour_field.displacement_mm) {
    const disp = rd.contour_field.displacement_mm;
    const x = rd.contour_field.x || Array.from({ length: disp.length }, (_, i) => i);
    plots.push({ id: 'deflection', title: 'Deflection Profile', traces: [
      { x, y: disp, type: 'scatter', mode: 'lines', name: 'δ(x) mm', line: { color: '#3B82F6', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(59,130,246,0.1)' }
    ], layout: layout('Beam Deflection δ(x)', { xaxis: { ...DARK.xaxis, title: 'Position x' }, yaxis: { ...DARK.yaxis, title: 'Deflection δ (mm)' } }), config: CFG });
  } else if (rd.deflection_profile || !rd.deflection_profile) {
    const L  = pu(md.GEOMETRY?.Length?.value) || 0.5;
    const F  = pu(md.LOADING?.Magnitude?.value) || 500;
    const E  = 200e9;
    const I  = (pu(md.GEOMETRY?.Width?.value || '0.03') * Math.pow(pu(md.GEOMETRY?.Height?.value || '0.01'), 3)) / 12;
    const x  = linspace(0, L, 80);
    const y  = x.map(xi => -(F * xi * xi * (3 * L - xi)) / (6 * E * I) * 1000);
    plots.push({ id: 'deflection', title: 'Deflection Profile', traces: [
      { x: x.map(v => v * 1000), y, type: 'scatter', mode: 'lines', name: 'δ(x) mm', line: { color: '#3B82F6', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(59,130,246,0.1)' }
    ], layout: layout('Beam Deflection δ(x)', { xaxis: { ...DARK.xaxis, title: 'Position x (mm)' }, yaxis: { ...DARK.yaxis, title: 'Deflection δ (mm)' } }), config: CFG });
  }

  // ─── Safety factor summary bar ───────────────────────────────
  const sf   = getM('Max Von Mises Stress', '250') ? 1.5 / (pu(rd?.metrics?.find(m=>m.name==='Max Von Mises Stress')?.value) / 250) : getM('Safety factor', '1.5');
  const sfY  = getM('Yield safety factor', sf * 0.9);
  const sfFat= getM('Fatigue safety factor', sf * 0.8);
  plots.push({ id: 'safety', title: 'Safety Factors', traces: [{
    x: ['Bending', 'Yield', 'Fatigue', 'Min Required'],
    y: [sf, sfY, sfFat, 1.5],
    type: 'bar',
    marker: { color: [sf>1.5?'#22C55E':'#EF4444', sfY>1.5?'#22C55E':'#EF4444', sfFat>1?'#22C55E':'#EF4444', '#EF4444'] }
  }], layout: layout('Safety Factor Summary', { xaxis: { ...DARK.xaxis }, yaxis: { ...DARK.yaxis, title: 'SF', range: [0, Math.max(sf, sfY, sfFat, 1.5) * 1.3] } }), config: CFG });
}

// ═══════════════════════════════════════════════════════════════
// PHYSICS
// ═══════════════════════════════════════════════════════════════
function physicsPlots(rd, md, plots) {
  if (rd.ladder_profile) {
    const x = rd.ladder_profile.distance || [];
    plots.push({ id: 'ladder_friction', title: 'Friction vs Climb Distance', traces: [
      { x, y: rd.ladder_profile.friction || [], type: 'scatter', mode: 'lines', name: 'Required floor friction', line: { color: '#EF4444', width: 2 } },
      { x, y: rd.ladder_profile.frictionLimit || [], type: 'scatter', mode: 'lines', name: 'Friction limit μN', line: { color: '#F59E0B', width: 2, dash: 'dash' } }
    ], layout: layout('Ladder Slip — Friction vs Climbing Distance', {
      xaxis: { ...DARK.xaxis, title: 'Distance along ladder (m)' },
      yaxis: { ...DARK.yaxis, title: 'Friction force (N)' }
    }), config: CFG });

    plots.push({ id: 'ladder_reactions', title: 'Reaction Forces', traces: [
      { x, y: rd.ladder_profile.wallReaction || [], type: 'scatter', mode: 'lines', name: 'Wall normal reaction', line: { color: '#3B82F6', width: 2 } },
      { x, y: rd.ladder_profile.floorNormal || [], type: 'scatter', mode: 'lines', name: 'Floor normal reaction', line: { color: '#22C55E', width: 2 } }
    ], layout: layout('Ladder Slip — Normal Reactions', {
      xaxis: { ...DARK.xaxis, title: 'Distance along ladder (m)' },
      yaxis: { ...DARK.yaxis, title: 'Reaction force (N)' }
    }), config: CFG });
    return;
  }

  // Motion: x(t), v(t), a(t)
  if (rd.motion_t || rd.time_series) {
    const t  = rd.motion_t  || rd.time_series?.t  || linspace(0, 2, 100);
    const x  = rd.motion_x  || rd.time_series?.x  || t.map(ti => 0.5 * pu(rd?.metrics?.find(m=>m.name==='Acceleration')?.value) * ti * ti);
    const v  = rd.motion_v  || rd.time_series?.v  || t.map(ti => pu(rd?.metrics?.find(m=>m.name==='Acceleration')?.value) * ti);
    plots.push({ id: 'motion', title: 'Motion — x(t) & v(t)', traces: [
      { x: t, y: x, type: 'scatter', mode: 'lines', name: 'x (m)', line: { color: '#3B82F6', width: 2 } },
      { x: t, y: v, type: 'scatter', mode: 'lines', name: 'v (m/s)', line: { color: '#22C55E', width: 2 }, yaxis: 'y2' }
    ], layout: layout('Kinematics — x(t) & v(t)', {
      xaxis: { ...DARK.xaxis, title: 'Time (s)' }, yaxis: { ...DARK.yaxis, title: 'Position x (m)' },
      yaxis2: { title: 'Velocity (m/s)', overlaying: 'y', side: 'right', gridcolor: '#252A32', tickfont: { color: '#22C55E', size: 10 }, color: '#22C55E' }
    }), config: CFG });
  } else {
    // Synthetic kinematics
    const a = pu(rd?.metrics?.find(m=>m.name==='Acceleration')?.value);
    const T = pu(rd?.metrics?.find(m=>m.name==='String tension')?.value);
    const t = linspace(0, 2, 80);
    const x = t.map(ti => 0.5 * a * ti * ti);
    const v = t.map(ti => a * ti);
    plots.push({ id: 'motion', title: 'Motion — x(t) & v(t)', traces: [
      { x: t, y: x, type: 'scatter', mode: 'lines', name: 'x (m)', line: { color: '#3B82F6', width: 2 } },
      { x: t, y: v, type: 'scatter', mode: 'lines', name: 'v (m/s)', line: { color: '#22C55E', width: 2 }, yaxis: 'y2' }
    ], layout: layout('Kinematics — x(t) & v(t)', {
      xaxis: { ...DARK.xaxis, title: 'Time (s)' }, yaxis: { ...DARK.yaxis, title: 'Position x (m)' },
      yaxis2: { title: 'Velocity (m/s)', overlaying: 'y', side: 'right', gridcolor: '#252A32', tickfont: { color: '#22C55E', size: 10 }, color: '#22C55E' }
    }), config: CFG });
  }

  // SHM if spring
  if (rd.spring_profile || String(md.SYSTEM_TYPE||'').toLowerCase().includes('spring')) {
    const wn = pu(rd?.metrics?.find(m=>m.name==='Natural frequency (ωn)')?.value || '3');
    const A  = pu(rd?.metrics?.find(m=>m.name==='Amplitude (A)')?.value || '0.1');
    const t  = linspace(0, 4 * Math.PI / wn, 200);
    const x  = t.map(ti => A * Math.cos(wn * ti));
    const KE = t.map(ti => 0.5 * 1 * Math.pow(-A * wn * Math.sin(wn * ti), 2));
    const PE = t.map(ti => 0.5 * (wn * wn) * Math.pow(A * Math.cos(wn * ti), 2));
    plots.push({ id: 'shm', title: 'SHM — x(t)', traces: [
      { x: t, y: x, type: 'scatter', mode: 'lines', name: 'x(t)', line: { color: '#3B82F6', width: 2 } }
    ], layout: layout('SHM Oscillation', { xaxis: { ...DARK.xaxis, title: 'Time (s)' }, yaxis: { ...DARK.yaxis, title: 'x (m)' } }), config: CFG });

    plots.push({ id: 'energy', title: 'Energy — KE & PE', traces: [
      { x: t, y: KE, type: 'scatter', mode: 'lines', name: 'KE', line: { color: '#F59E0B', width: 2 } },
      { x: t, y: PE, type: 'scatter', mode: 'lines', name: 'PE', line: { color: '#22C55E', width: 2 } },
      { x: t, y: KE.map((k,i)=>k+PE[i]), type: 'scatter', mode: 'lines', name: 'E_total', line: { color: '#EF4444', width: 1.5, dash: 'dash' } }
    ], layout: layout('Energy Balance — SHM', { xaxis: { ...DARK.xaxis, title: 'Time (s)' }, yaxis: { ...DARK.yaxis, title: 'Energy (J)' } }), config: CFG });
  }

  // Wave profile
  if (String(md.SYSTEM_TYPE||'').toLowerCase().includes('wave')) {
    const f   = pu(md.WAVE?.Frequency?.value) || 10;
    const A   = pu(md.WAVE?.Amplitude?.value) || 0.1;
    const wl  = pu(md.WAVE?.Wavelength?.value) || 2;
    const x   = linspace(0, 3 * wl, 300);
    const y   = x.map(xi => A * Math.sin(2 * Math.PI * xi / wl));
    plots.push({ id: 'wave', title: 'Wave Profile', traces: [
      { x, y, type: 'scatter', mode: 'lines', name: 'y(x)', line: { color: '#3B82F6', width: 2 } }
    ], layout: layout('Wave — y(x)', { xaxis: { ...DARK.xaxis, title: 'x (m)' }, yaxis: { ...DARK.yaxis, title: 'y (m)' } }), config: CFG });
  }
}

// ═══════════════════════════════════════════════════════════════
// THERMAL
// ═══════════════════════════════════════════════════════════════
function thermalPlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);

  // Check for pre-built Plotly data from enhanced parser (Elmer)
  if (rd.plotly_data && Array.isArray(rd.plotly_data) && rd.plotly_data.length > 0) {
    console.log('[plotEngine] Using pre-built plotly_data from thermal parser');
    
    // Group traces by yaxis for proper layout
    const tracesByYaxis = {};
    rd.plotly_data.forEach(trace => {
      const yaxis = trace.yaxis || 'y';
      if (!tracesByYaxis[yaxis]) tracesByYaxis[yaxis] = [];
      tracesByYaxis[yaxis].push(trace);
    });
    
    // Build layout with multiple yaxes if needed
    const layoutExtra = {
      xaxis: { ...DARK.xaxis, title: 'Value' }
    };
    
    if (tracesByYaxis.y2) {
      layoutExtra.yaxis2 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'Stress (MPa)',
        tickfont: { color: '#F59E0B', size: 10 },
        color: '#F59E0B'
      };
    }
    if (tracesByYaxis.y3) {
      layoutExtra.yaxis3 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'Displacement (mm)',
        tickfont: { color: '#A855F7', size: 10 },
        color: '#A855F7'
      };
    }
    if (tracesByYaxis.y4) {
      layoutExtra.yaxis4 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'Displacement (mm)',
        tickfont: { color: '#22C55E', size: 10 },
        color: '#22C55E'
      };
    }
    
    // Separate scatter plots from histograms
    const scatterPlots = rd.plotly_data.filter(t => t.type === 'scatter');
    const histogramPlots = rd.plotly_data.filter(t => t.type === 'histogram');
    
    if (scatterPlots.length > 0) {
      plots.push({
        id: 'thermal_correlation',
        title: 'Thermal-Structural Correlation',
        traces: scatterPlots,
        layout: layout('Temperature vs Stress', layoutExtra),
        config: CFG
      });
    }
    
    if (histogramPlots.length > 0) {
      histogramPlots.forEach((hist, idx) => {
        plots.push({
          id: `thermal_hist_${idx}`,
          title: hist.name || 'Distribution',
          traces: [hist],
          layout: layout(hist.name || 'Distribution'),
          config: CFG
        });
      });
    }
    
    // Add metrics table
    if (rd.metrics && rd.metrics.length > 0) {
      plots.push({
        id: 'thermal_metrics',
        title: 'Thermal-Structural Metrics',
        traces: [{
          type: 'table',
          header: { values: ['Metric', 'Value', 'Unit'] },
          cells: { 
            values: [
              rd.metrics.map(m => m.name),
              rd.metrics.map(m => String(m.value)),
              rd.metrics.map(m => m.unit || '')
            ]
          }
        }],
        layout: layout('Multi-Physics Analysis Summary'),
        config: CFG
      });
    }
    
    return;
  }

  const q    = getM('Heat load', pu(md.HEAT_LOAD?.['Power dissipation']?.value)||25);
  const tamb = getM('Ambient', pu(md.TEMPERATURES?.['Ambient temperature']?.value)||25);
  const tj   = getM('Junction temperature', 75);
  const tc   = getM('Case temperature', tamb+q*1.0);
  const ts   = getM('Sink base temperature', tamb+q*0.5);
  const rjc  = getM('Junction-to-case resistance', 1.0);
  const ri   = getM('Interface resistance', 0.5);
  const rhs  = getM('Required heatsink resistance', 1.5);

  // ─── R_th breakdown bar ──────────────────────────────────────
  plots.push({ id: 'rth_bar', title: 'Thermal Resistance Budget', traces: [{
    x: ['R_jc', 'R_interface', 'R_heatsink'],
    y: [rjc, ri, rhs],
    type: 'bar',
    marker: { color: ['#EF4444', '#F59E0B', '#22C55E'] }
  }], layout: layout('Thermal Resistance Breakdown (K/W)', { xaxis: { ...DARK.xaxis, title: 'Path segment' }, yaxis: { ...DARK.yaxis, title: 'R_th (K/W)' } }), config: CFG });

  // ─── Temperature waterfall (junction to ambient) ─────────────
  plots.push({ id: 'temp_ladder', title: 'Temperature Cascade', traces: [{
    x: ['T_junction', 'T_case', 'T_sink_base', 'T_ambient'],
    y: [tj, tc, ts, tamb],
    type: 'bar',
    marker: {
      color: ['#EF4444', '#F59E0B', '#3B82F6', '#22C55E'],
      line: { color: '#252A32', width: 1 }
    }
  }], layout: layout('Temperature Nodes (°C)', { xaxis: { ...DARK.xaxis }, yaxis: { ...DARK.yaxis, title: 'Temperature (°C)' } }), config: CFG });

  // ─── Synthetic 2D temperature heatmap ────────────────────────
  const nx = 24, ny = 10;
  const z = Array.from({ length: ny }, (_, j) =>
    Array.from({ length: nx }, (_, i) => {
      const dist = Math.sqrt(Math.pow((i - nx/2) / (nx/2), 2) + Math.pow((j - ny/2) / (ny/2), 2));
      return tamb + (tj - tamb) * Math.max(0, 1 - dist);
    })
  );
  plots.push({ id: 'heat_map', title: 'Temperature Distribution', traces: [{
    z, type: 'heatmap',
    colorscale: [[0,'#06B6D4'],[0.3,'#3B82F6'],[0.6,'#F59E0B'],[0.85,'#EF4444'],[1,'#FFF']],
    colorbar: { title: '°C', tickfont: { color: '#8C929E', size: 10 } }
  }], layout: layout('2D Temperature Map (PCB/Heatsink)', { xaxis: { ...DARK.xaxis, title: 'x (nodes)' }, yaxis: { ...DARK.yaxis, title: 'y (nodes)' } }), config: CFG });
}

// ═══════════════════════════════════════════════════════════════
// AEROSPACE
// ═══════════════════════════════════════════════════════════════
function aerospacePlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);
  const sys = String(md.SYSTEM_TYPE||'').toLowerCase();

  // Check for pre-built Plotly data from enhanced parser (XFOIL)
  if (rd.plotly_data && Array.isArray(rd.plotly_data) && rd.plotly_data.length > 0) {
    console.log('[plotEngine] Using pre-built plotly_data from aerospace parser');
    
    // Group traces by yaxis for proper layout
    const tracesByYaxis = {};
    rd.plotly_data.forEach(trace => {
      const yaxis = trace.yaxis || 'y';
      if (!tracesByYaxis[yaxis]) tracesByYaxis[yaxis] = [];
      tracesByYaxis[yaxis].push(trace);
    });
    
    // Build layout with multiple yaxes if needed
    const layoutExtra = {
      xaxis: { ...DARK.xaxis, title: 'Angle of Attack (°)' }
    };
    
    if (tracesByYaxis.y2) {
      layoutExtra.yaxis2 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'CD',
        tickfont: { color: '#F59E0B', size: 10 },
        color: '#F59E0B'
      };
    }
    if (tracesByYaxis.y3) {
      layoutExtra.yaxis3 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'CM',
        tickfont: { color: '#A855F7', size: 10 },
        color: '#A855F7'
      };
    }
    if (tracesByYaxis.y4) {
      layoutExtra.yaxis4 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'L/D',
        tickfont: { color: '#22C55E', size: 10 },
        color: '#22C55E'
      };
    }
    
    // Separate drag polar (CL vs CD) from AoA plots
    const aoaPlots = rd.plotly_data.filter(t => t.x && t.name && t.name.includes('vs AoA'));
    const dragPolar = rd.plotly_data.find(t => t.name && t.name.includes('Drag Polar'));
    
    if (aoaPlots.length > 0) {
      plots.push({
        id: 'aerodynamic_coeffs',
        title: 'Aerodynamic Coefficients',
        traces: aoaPlots,
        layout: layout('CL, CD, CM vs AoA', layoutExtra),
        config: CFG
      });
    }
    
    if (dragPolar) {
      plots.push({
        id: 'drag_polar',
        title: 'Drag Polar',
        traces: [dragPolar],
        layout: layout('Drag Polar — CL vs CD', {
          xaxis: { ...DARK.xaxis, title: 'CD' },
          yaxis: { ...DARK.yaxis, title: 'CL' }
        }),
        config: CFG
      });
    }
    
    // Add metrics table
    if (rd.metrics && rd.metrics.length > 0) {
      plots.push({
        id: 'aero_metrics',
        title: 'Aerodynamic Metrics',
        traces: [{
          type: 'table',
          header: { values: ['Metric', 'Value', 'Unit'] },
          cells: { 
            values: [
              rd.metrics.map(m => m.name),
              rd.metrics.map(m => String(m.value)),
              rd.metrics.map(m => m.unit || '')
            ]
          }
        }],
        layout: layout('Airfoil Analysis Summary'),
        config: CFG
      });
    }
    
    return;
  }

  if (sys.includes('wing') || sys.includes('uav') || sys.includes('airfoil') || rd.alpha_list) {
    // CL vs alpha
    if (rd.alpha_list) {
      plots.push({ id: 'cl_alpha', title: 'CL vs α', traces: [
        { x: rd.alpha_list, y: rd.cl_list, type: 'scatter', mode: 'lines+markers', name: 'CL', line: { color: '#3B82F6', width: 2 }, marker: { color: '#3B82F6', size: 5 } },
        { x: rd.alpha_list, y: rd.cd_list||[], type: 'scatter', mode: 'lines+markers', name: 'CD', line: { color: '#F59E0B', width: 2, dash: 'dash' }, marker: { color: '#F59E0B', size: 5 }, yaxis: 'y2' }
      ], layout: layout('CL & CD vs Angle of Attack', {
        xaxis: { ...DARK.xaxis, title: 'α (°)' }, yaxis: { ...DARK.yaxis, title: 'CL' },
        yaxis2: { title: 'CD', overlaying: 'y', side: 'right', gridcolor: '#252A32', tickfont: { color: '#F59E0B', size: 10 }, color: '#F59E0B' }
      }), config: CFG });
    } else {
      // Synthetic CL vs alpha
      const alphas = linspace(-4, 14, 40);
      const CLs = alphas.map(a => 0.1 * a + 0.45);
      const CDs = alphas.map(a => 0.012 + 0.001 * a * a);
      plots.push({ id: 'cl_alpha', title: 'CL vs α', traces: [
        { x: alphas, y: CLs, type: 'scatter', mode: 'lines', name: 'CL', line: { color: '#3B82F6', width: 2 } },
        { x: alphas, y: CDs, type: 'scatter', mode: 'lines', name: 'CD', line: { color: '#F59E0B', width: 2, dash: 'dash' }, yaxis: 'y2' }
      ], layout: layout('CL & CD vs α (NACA lifting-line)', {
        xaxis: { ...DARK.xaxis, title: 'α (°)' }, yaxis: { ...DARK.yaxis, title: 'CL' },
        yaxis2: { title: 'CD', overlaying: 'y', side: 'right', gridcolor: '#252A32', tickfont: { color: '#F59E0B', size: 10 }, color: '#F59E0B' }
      }), config: CFG });

      // Drag polar
      plots.push({ id: 'drag_polar', title: 'Drag Polar', traces: [
        { x: CDs, y: CLs, type: 'scatter', mode: 'lines+markers', name: 'CD vs CL', line: { color: '#22C55E', width: 2 }, marker: { color: '#22C55E', size: 4 } }
      ], layout: layout('Drag Polar — CL vs CD', { xaxis: { ...DARK.xaxis, title: 'CD' }, yaxis: { ...DARK.yaxis, title: 'CL' } }), config: CFG });
    }

    // Elliptical lift distribution
    const span = pu(md.GEOMETRY?.Wingspan?.value)||2;
    const CL_fin= getM('Finite-wing CL', '0.8');
    const y = linspace(-span/2, span/2, 80);
    const gamma = y.map(yi => CL_fin * Math.sqrt(Math.max(0, 1 - Math.pow(2*yi/span, 2))));
    plots.push({ id: 'lift_dist', title: 'Lift Distribution', traces: [
      { x: y, y: gamma, type: 'scatter', mode: 'lines', name: 'Γ(y)', fill: 'tozeroy', fillcolor: 'rgba(59,130,246,0.15)', line: { color: '#3B82F6', width: 2 } }
    ], layout: layout('Elliptical Lift Distribution', { xaxis: { ...DARK.xaxis, title: 'Span y (m)' }, yaxis: { ...DARK.yaxis, title: 'Circulation Γ' } }), config: CFG });

  } else {
    // Nozzle plots
    const nNodes = 60;
    const x = linspace(0, 1, nNodes);
    // Mach number along nozzle (area ratio relation, simplified)
    const Mach = x.map(xi => {
      if (xi < 0.4) return xi / 0.4; // subsonic
      if (xi < 0.5) return 1; // throat
      return 1 + 4 * (xi - 0.5); // supersonic
    });
    const P0 = getM('Chamber Pressure', 5e6) || 5e6;
    const gamma = pu(md.PROPULSION?.['Gamma']?.value||'1.2')||1.2;
    const Pnorm = Mach.map(M => Math.pow(1 + (gamma-1)/2 * M*M, -gamma/(gamma-1)));
    const Tnorm = Mach.map(M => Math.pow(1 + (gamma-1)/2 * M*M, -1));

    plots.push({ id: 'mach_profile', title: 'Mach Number Profile', traces: [
      { x: x.map(v => v*100), y: Mach, type: 'scatter', mode: 'lines', name: 'M(x)', line: { color: '#3B82F6', width: 2 } },
      { x: [40, 40], y: [0, 4], type: 'scatter', mode: 'lines', name: 'Throat', line: { color: '#EF4444', width: 1.5, dash: 'dot' } }
    ], layout: layout('Mach Number Along Nozzle', { xaxis: { ...DARK.xaxis, title: 'Axial position (%)' }, yaxis: { ...DARK.yaxis, title: 'Mach number M' } }), config: CFG });

    plots.push({ id: 'pressure_profile', title: 'Pressure Profile', traces: [
      { x: x.map(v => v*100), y: Pnorm.map(p => p * P0 / 1e6), type: 'scatter', mode: 'lines', name: 'P(x) MPa', line: { color: '#F59E0B', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(245,158,11,0.1)' }
    ], layout: layout('Static Pressure Along Nozzle', { xaxis: { ...DARK.xaxis, title: 'Axial position (%)' }, yaxis: { ...DARK.yaxis, title: 'Pressure (MPa)' } }), config: CFG });

    plots.push({ id: 'temp_profile', title: 'Temperature Profile', traces: [
      { x: x.map(v => v*100), y: Tnorm.map(t => t * (getM('Chamber Temperature', 3000)||3000)), type: 'scatter', mode: 'lines', name: 'T(x) K', line: { color: '#EF4444', width: 2 } }
    ], layout: layout('Static Temperature Along Nozzle', { xaxis: { ...DARK.xaxis, title: 'Axial position (%)' }, yaxis: { ...DARK.yaxis, title: 'Temperature (K)' } }), config: CFG });
  }
}

// ═══════════════════════════════════════════════════════════════
// CONTROL SYSTEMS
// ═══════════════════════════════════════════════════════════════
function controlPlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);

  // Use existing data if available (from python-control backend)
  if (rd.step_response) {
    const { t, y } = rd.step_response;
    plots.push({ id: 'step', title: 'Step Response', traces: [
      { x: t, y, type: 'scatter', mode: 'lines', name: 'y(t)', line: { color: '#3B82F6', width: 2 } },
      { x: [0, t[t.length-1]], y: [1, 1], type: 'scatter', mode: 'lines', name: 'Setpoint', line: { color: '#22C55E', width: 1.5, dash: 'dash' } }
    ], layout: layout('Step Response', { xaxis: { ...DARK.xaxis, title: 'Time (s)' }, yaxis: { ...DARK.yaxis, title: 'Output y(t)' } }), config: CFG });
  } else {
    // Synthetic step response from PID metrics
    const zeta = getM('Damping ratio', 0.7);
    const wn   = getM('Natural frequency', 4);
    const ts   = getM('Predicted settling time', 1.4);
    const os   = getM('Predicted overshoot', 5);
    const t    = linspace(0, ts * 2.5, 300);
    const wd   = wn * Math.sqrt(Math.max(0.001, 1 - zeta * zeta));
    const y    = t.map(ti => {
      if (ti <= 0) return 0;
      return 1 - Math.exp(-zeta * wn * ti) * (Math.cos(wd * ti) + (zeta / Math.sqrt(Math.max(0.001, 1 - zeta*zeta))) * Math.sin(wd * ti));
    });

    plots.push({ id: 'step', title: 'Step Response', traces: [
      { x: t, y, type: 'scatter', mode: 'lines', name: 'y(t)', line: { color: '#3B82F6', width: 2 } },
      { x: [0, t[t.length-1]], y: [1, 1], type: 'scatter', mode: 'lines', name: 'Setpoint', line: { color: '#22C55E', width: 1.5, dash: 'dash' } },
      { x: [ts, ts], y: [0, 1.2], type: 'scatter', mode: 'lines', name: `Ts=${ts.toFixed(2)}s`, line: { color: '#EF4444', width: 1, dash: 'dot' } }
    ], layout: layout('Closed-Loop Step Response', { xaxis: { ...DARK.xaxis, title: 'Time (s)' }, yaxis: { ...DARK.yaxis, title: 'Output y(t)', range: [-0.05, 1.4] } }), config: CFG });
  }

  // Bode from backend or synthetic
  if (rd.bode_mag) {
    const { freq, mag, phase } = rd.bode_mag;
    plots.push({ id: 'bode_mag', title: 'Bode — Magnitude', traces: [
      { x: freq, y: mag, type: 'scatter', mode: 'lines', name: '|L(jω)|', line: { color: '#22C55E', width: 2 } }
    ], layout: layout('Bode — Magnitude', { xaxis: { ...DARK.xaxis, title: 'ω (rad/s)', type: 'log' }, yaxis: { ...DARK.yaxis, title: 'dB' } }), config: CFG });
    plots.push({ id: 'bode_phase', title: 'Bode — Phase', traces: [
      { x: freq, y: phase, type: 'scatter', mode: 'lines', name: '∠L(jω)', line: { color: '#F59E0B', width: 2 } }
    ], layout: layout('Bode — Phase', { xaxis: { ...DARK.xaxis, title: 'ω (rad/s)', type: 'log' }, yaxis: { ...DARK.yaxis, title: 'Phase (°)' } }), config: CFG });
  } else {
    // Synthetic Bode for G(s) = wn²/(s²+2ζwn·s+wn²)
    const zeta = getM('Damping ratio', 0.7);
    const wn   = getM('Natural frequency', 4);
    const freq = linspace(-1, 2, 200).map(v => Math.pow(10, v));
    const mag  = freq.map(w => {
      const r = w / wn;
      const den = Math.sqrt(Math.pow(1 - r*r, 2) + Math.pow(2*zeta*r, 2));
      return 20 * Math.log10(1 / den);
    });
    const phase_ = freq.map(w => {
      const r = w / wn;
      return -Math.atan2(2 * zeta * r, 1 - r * r) * 180 / Math.PI;
    });
    // Phase & gain margin lines
    const gm_freq = wn * Math.sqrt(1 - 2 * zeta * zeta);
    plots.push({ id: 'bode_mag', title: 'Bode — Magnitude', traces: [
      { x: freq, y: mag, type: 'scatter', mode: 'lines', name: '|G(jω)|', line: { color: '#22C55E', width: 2 } },
      { x: [wn, wn], y: [-80, 20], type: 'scatter', mode: 'lines', name: 'ωn', line: { color: '#EF4444', width: 1, dash: 'dot' } }
    ], layout: layout('Bode — Magnitude', { xaxis: { ...DARK.xaxis, title: 'ω (rad/s)', type: 'log' }, yaxis: { ...DARK.yaxis, title: 'dB' } }), config: CFG });

    plots.push({ id: 'bode_phase', title: 'Bode — Phase', traces: [
      { x: freq, y: phase_, type: 'scatter', mode: 'lines', name: '∠G(jω)', line: { color: '#F59E0B', width: 2 } }
    ], layout: layout('Bode — Phase', { xaxis: { ...DARK.xaxis, title: 'ω (rad/s)', type: 'log' }, yaxis: { ...DARK.yaxis, title: 'Phase (°)' } }), config: CFG });
  }

  // Pole-zero map
  if (rd.poles) {
    plots.push({ id: 'pole_zero', title: 'Pole-Zero Map', traces: [
      { x: rd.poles.map(p => p.re), y: rd.poles.map(p => p.im), type: 'scatter', mode: 'markers', name: 'Poles', marker: { symbol: 'x', color: '#EF4444', size: 12 } },
      ...(rd.zeros ? [{ x: rd.zeros.map(z => z.re), y: rd.zeros.map(z => z.im), type: 'scatter', mode: 'markers', name: 'Zeros', marker: { symbol: 'circle-open', color: '#22C55E', size: 12 } }] : [])
    ], layout: layout('Pole-Zero Map', { xaxis: { ...DARK.xaxis, title: 'Re', zeroline: true }, yaxis: { ...DARK.yaxis, title: 'Im', zeroline: true, scaleanchor: 'x' } }), config: CFG });
  } else {
    // Synthetic poles from zeta/wn
    const zeta = getM('Damping ratio', 0.7);
    const wn   = getM('Natural frequency', 4);
    const sigma = -zeta * wn;
    const wd    = wn * Math.sqrt(Math.max(0, 1 - zeta * zeta));
    plots.push({ id: 'pole_zero', title: 'Pole-Zero Map', traces: [
      { x: [sigma, sigma], y: [wd, -wd], type: 'scatter', mode: 'markers', name: 'CL Poles', marker: { symbol: 'x', color: '#EF4444', size: 14, line: { width: 2, color: '#EF4444' } } },
      { x: [0], y: [0], type: 'scatter', mode: 'markers', name: 'Origin', marker: { symbol: 'cross', color: '#8C929E', size: 10 } }
    ], layout: layout('Pole-Zero Map (s-plane)', { xaxis: { ...DARK.xaxis, title: 'σ (real)', zeroline: true, zerolinecolor: '#3B3F4A' }, yaxis: { ...DARK.yaxis, title: 'jω (imaginary)', zeroline: true, zerolinecolor: '#3B3F4A' } }), config: CFG });
  }
}

// ═══════════════════════════════════════════════════════════════
// MATERIALS
// ═══════════════════════════════════════════════════════════════
function materialsPlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);
  const smin = getM('Minimum stress', pu(md.LOADING?.['Minimum stress']?.value)||20);
  const smax = getM('Maximum stress', pu(md.LOADING?.['Maximum stress']?.value)||220);
  const ult  = getM('Ultimate strength', pu(md.MATERIAL?.['Ultimate strength']?.value)||550);
  const se   = getM('Endurance strength', pu(md.MATERIAL?.['Endurance strength']?.value)||275);
  const smean= getM('Mean stress', (smax+smin)/2);
  const salt = getM('Alternating stress', Math.abs(smax-smin)/2);
  const sf   = getM('Fatigue safety factor', 2);
  const util = getM('Goodman utilization', 0.5);

  // ─── Goodman Diagram ─────────────────────────────────────────
  const meanPts = [0, ult];
  const altPts  = [se, 0];
  plots.push({ id: 'goodman', title: 'Goodman Diagram', traces: [
    { x: meanPts, y: altPts, type: 'scatter', mode: 'lines', name: 'Goodman line', line: { color: '#22C55E', width: 2 } },
    { x: [smean], y: [salt], type: 'scatter', mode: 'markers', name: 'Design point', marker: { color: '#3B82F6', size: 12, symbol: 'star' } },
    { x: [smean / sf], y: [salt / sf], type: 'scatter', mode: 'markers', name: `SF=${sf.toFixed(2)} boundary`, marker: { color: '#F59E0B', size: 10, symbol: 'circle-open', line: { width: 2, color: '#F59E0B' } } }
  ], layout: layout('Goodman Fatigue Diagram', { xaxis: { ...DARK.xaxis, title: 'Mean Stress σ_m (MPa)', range: [0, ult * 1.1] }, yaxis: { ...DARK.yaxis, title: 'Alt. Stress σ_a (MPa)', range: [0, se * 1.1] } }), config: CFG });

  // ─── S-N curve (synthetic) ───────────────────────────────────
  const Nvals = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
  const Svals = Nvals.map(N => N < 1e6 ? se * (1 + 0.3 * Math.log10(1e6 / N)) : se);
  plots.push({ id: 'sn_curve', title: 'S-N Fatigue Curve', traces: [
    { x: Nvals, y: Svals, type: 'scatter', mode: 'lines', name: 'S-N curve', line: { color: '#22C55E', width: 2 } },
    { x: [1e6], y: [se], type: 'scatter', mode: 'markers', name: 'Endurance limit', marker: { color: '#F59E0B', size: 10 } },
    { x: [1e6], y: [salt], type: 'scatter', mode: 'markers', name: 'Design σ_a', marker: { color: '#3B82F6', size: 10, symbol: 'diamond' } }
  ], layout: layout('S-N Fatigue Curve', { xaxis: { ...DARK.xaxis, title: 'Cycles N', type: 'log' }, yaxis: { ...DARK.yaxis, title: 'Stress Amplitude (MPa)' } }), config: CFG });

  // ─── Safety factor summary ───────────────────────────────────
  const sfY = getM('Yield safety factor', sf * 1.1);
  plots.push({ id: 'sf_summary', title: 'Safety Factors', traces: [{
    x: ['Fatigue (Goodman)', 'Yield', 'Required min'],
    y: [sf, sfY, 1.5],
    type: 'bar',
    marker: { color: [sf >= 1.5 ? '#22C55E' : '#EF4444', sfY >= 1.5 ? '#22C55E' : '#EF4444', '#F59E0B'] }
  }], layout: layout('Safety Factor Summary', { xaxis: { ...DARK.xaxis }, yaxis: { ...DARK.yaxis, title: 'Safety Factor', range: [0, Math.max(sf, sfY) * 1.4] } }), config: CFG });
}

// ═══════════════════════════════════════════════════════════════
// POWER SYSTEMS
// ═══════════════════════════════════════════════════════════════
function powerPlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);
  const pout   = getM('Output power', 1200);
  const pin    = getM('Input power', 1263);
  const losses = getM('Total losses', 63);
  const eta    = getM('Efficiency', 95);
  const i1     = getM('Primary current', pin / (getM('Primary voltage', 240)||240));
  const i2     = pu(md.INPUT?.['Secondary current']?.value)||10;
  const v1     = pu(md.INPUT?.['Primary voltage']?.value)||240;
  const v2     = pu(md.INPUT?.['Secondary voltage']?.value)||120;

  // ─── Power flow bar ──────────────────────────────────────────
  plots.push({ id: 'power_bar', title: 'Power Flow', traces: [{
    x: ['P_in', 'P_out', 'P_losses'],
    y: [pin, pout, losses],
    type: 'bar',
    marker: { color: ['#3B82F6', '#22C55E', '#EF4444'] }
  }], layout: layout('Power Balance (W)', { xaxis: { ...DARK.xaxis }, yaxis: { ...DARK.yaxis, title: 'Power (W)' } }), config: CFG });

  // ─── Loss breakdown pie ──────────────────────────────────────
  plots.push({ id: 'loss_pie', title: 'Loss Breakdown', traces: [{
    values: [pout, losses],
    labels: ['Useful output', 'Losses (copper+iron)'],
    type: 'pie',
    marker: { colors: ['#22C55E', '#EF4444'] },
    textfont: { family: 'JetBrains Mono, monospace', color: '#E8EAF0', size: 11 },
    hole: 0.35
  }], layout: { ...layout('Transformer Efficiency'), showlegend: true, paper_bgcolor: '#0D0F12' }, config: CFG });

  // ─── Voltage & current profile ───────────────────────────────
  plots.push({ id: 'vi_bar', title: 'Voltage & Current', traces: [
    { x: ['V_primary', 'V_secondary'], y: [v1, v2], type: 'bar', name: 'Voltage (V)', marker: { color: ['#3B82F6', '#22C55E'] } },
    { x: ['I_primary', 'I_secondary'], y: [i1, i2], type: 'bar', name: 'Current (A)', marker: { color: ['#A855F7', '#F59E0B'] }, yaxis: 'y2' }
  ], layout: layout('Voltage & Current Profile', {
    xaxis: { ...DARK.xaxis }, yaxis: { ...DARK.yaxis, title: 'Voltage (V)' },
    yaxis2: { title: 'Current (A)', overlaying: 'y', side: 'right', gridcolor: '#252A32', tickfont: { color: '#F59E0B', size: 10 }, color: '#F59E0B' }
  }), config: CFG });
}

// ═══════════════════════════════════════════════════════════════
// FLUIDS
// ═══════════════════════════════════════════════════════════════
function fluidPlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);

  // Check for pre-built Plotly data from enhanced parser (OpenFOAM)
  if (rd.plotly_data && Array.isArray(rd.plotly_data) && rd.plotly_data.length > 0) {
    console.log('[plotEngine] Using pre-built plotly_data from fluid parser');
    
    // Group traces by yaxis for proper layout
    const tracesByYaxis = {};
    rd.plotly_data.forEach(trace => {
      const yaxis = trace.yaxis || 'y';
      if (!tracesByYaxis[yaxis]) tracesByYaxis[yaxis] = [];
      tracesByYaxis[yaxis].push(trace);
    });
    
    // Build layout with multiple yaxes if needed
    const layoutExtra = {
      xaxis: { ...DARK.xaxis, title: 'Value' }
    };
    
    if (tracesByYaxis.y2) {
      layoutExtra.yaxis2 = { 
        ...DARK.yaxis, 
        overlaying: 'y', 
        side: 'right', 
        title: 'Velocity (m/s)',
        tickfont: { color: '#F59E0B', size: 10 },
        color: '#F59E0B'
      };
    }
    
    // Separate histograms from time series
    const histogramPlots = rd.plotly_data.filter(t => t.type === 'histogram');
    const timeSeriesPlots = rd.plotly_data.filter(t => t.type === 'scatter');
    
    if (histogramPlots.length > 0) {
      histogramPlots.forEach((hist, idx) => {
        plots.push({
          id: `fluid Hist_${idx}`,
          title: hist.name || 'Distribution',
          traces: [hist],
          layout: layout(hist.name || 'Distribution'),
          config: CFG
        });
      });
    }
    
    if (timeSeriesPlots.length > 0) {
      plots.push({
        id: 'fluid_timeseries',
        title: 'CFD Time Series',
        traces: timeSeriesPlots,
        layout: layout('Force vs Time', layoutExtra),
        config: CFG
      });
    }
    
    // Add metrics table
    if (rd.metrics && rd.metrics.length > 0) {
      plots.push({
        id: 'fluid_metrics',
        title: 'CFD Metrics',
        traces: [{
          type: 'table',
          header: { values: ['Metric', 'Value', 'Unit'] },
          cells: { 
            values: [
              rd.metrics.map(m => m.name),
              rd.metrics.map(m => String(m.value)),
              rd.metrics.map(m => m.unit || '')
            ]
          }
        }],
        layout: layout('CFD Analysis Summary'),
        config: CFG
      });
    }
    
    return;
  }

  const D    = getM('Diameter', pu(md.GEOMETRY?.Diameter?.value)||0.05);
  const L    = getM('Length', pu(md.GEOMETRY?.Length?.value)||0.5);
  const vel  = getM('Inlet velocity', pu(md.BOUNDARY_CONDITIONS?.['Inlet velocity']?.value)||2);
  const Re   = getM('Reynolds number', 5000);
  const dP   = getM('Pressure drop', 100);

  // Velocity profile (parabolic for laminar, flat-top for turbulent)
  const r = linspace(-D/2, D/2, 60);
  const laminar = Re < 2300;
  const uCL = vel * (laminar ? 2 : 1.22);
  const u   = r.map(ri => laminar
    ? uCL * (1 - Math.pow(ri/(D/2), 2))
    : uCL * Math.pow(Math.max(0, 1 - Math.abs(ri/(D/2))), 1/7)
  );
  plots.push({ id: 'vel_profile', title: 'Velocity Profile', traces: [
    { x: u, y: r.map(v => v * 1000), type: 'scatter', mode: 'lines', name: 'u(r)', fill: 'tozerox', fillcolor: 'rgba(59,130,246,0.12)', line: { color: '#3B82F6', width: 2 } }
  ], layout: layout(`${laminar ? 'Laminar' : 'Turbulent'} Velocity Profile`, { xaxis: { ...DARK.xaxis, title: 'Velocity u (m/s)' }, yaxis: { ...DARK.yaxis, title: 'Radius r (mm)' } }), config: CFG });

  // Pressure drop along pipe
  const x = linspace(0, L * 1000, 60);
  const P = x.map(xi => dP * (1 - xi / (L * 1000)));
  plots.push({ id: 'pressure', title: 'Pressure Along Pipe', traces: [
    { x, y: P, type: 'scatter', mode: 'lines', name: 'P(x)', fill: 'tozeroy', fillcolor: 'rgba(245,158,11,0.1)', line: { color: '#F59E0B', width: 2 } }
  ], layout: layout('Pressure Drop along Pipe', { xaxis: { ...DARK.xaxis, title: 'x (mm)' }, yaxis: { ...DARK.yaxis, title: 'Pressure (Pa)' } }), config: CFG });
}

// ═══════════════════════════════════════════════════════════════
// SEMICONDUCTORS
// ═══════════════════════════════════════════════════════════════
function semiconductorPlots(rd, md, plots) {
  const getM = (name, fb = 0) => pu(rd?.metrics?.find(m=>m.name===name)?.value) || pu(fb);

  // Use existing IV curves if available
  if (rd.iv_curves) {
    const traces = rd.iv_curves.map((curve, i) => ({
      x: curve.vds, y: curve.ids.map(v => v * 1e3),
      type: 'scatter', mode: 'lines',
      name: `Vgs=${curve.vgs}V`,
      line: { color: ['#3B82F6','#22C55E','#F59E0B','#EF4444','#A855F7'][i % 5], width: 2 }
    }));
    plots.push({ id: 'id_vds', title: 'I_D vs V_DS', traces, layout: layout('MOSFET Output Characteristics', { xaxis: { ...DARK.xaxis, title: 'V_DS (V)' }, yaxis: { ...DARK.yaxis, title: 'I_D (mA)' } }), config: CFG });
  } else {
    // Synthetic MOSFET IV curves
    const Vth  = 0.4, mu = getM('Channel Mobility', 450), tox = getM('Gate Oxide', 4e-9)||4e-9;
    const W    = getM('Channel Width', 2e-6)||2e-6, Lg = getM('Gate Length', 180e-9)||180e-9;
    const Cox  = 3.9 * 8.854e-12 / (tox||4e-9);
    const k    = mu * Cox * W / Lg;
    const vgsArr = [0.8, 1.2, 1.6, 1.8, 2.0];
    const vdsArr = linspace(0, 2.5, 60);
    const colors = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#A855F7'];
    const traces = vgsArr.map((vgs, i) => ({
      x: vdsArr, y: vdsArr.map(vds => {
        if (vgs <= Vth) return 0;
        const id_lin = k * ((vgs - Vth) * vds - 0.5 * vds * vds);
        const id_sat = 0.5 * k * Math.pow(vgs - Vth, 2);
        return Math.max(0, Math.min(id_lin, id_sat)) * 1e3; // mA
      }),
      type: 'scatter', mode: 'lines', name: `Vgs=${vgs}V`,
      line: { color: colors[i], width: 2 }
    }));
    plots.push({ id: 'id_vds', title: 'I_D vs V_DS', traces, layout: layout('MOSFET I_D vs V_DS Characteristics', { xaxis: { ...DARK.xaxis, title: 'V_DS (V)' }, yaxis: { ...DARK.yaxis, title: 'I_D (mA)' } }), config: CFG });

    // Vgs transfer characteristic
    const vgsList = linspace(0, 2.5, 80);
    const idVgs   = vgsList.map(vgs => vgs <= Vth ? 0 : 0.5 * k * Math.pow(vgs - Vth, 2) * 1e3);
    plots.push({ id: 'id_vgs', title: 'I_D vs V_GS (Transfer)', traces: [
      { x: vgsList, y: idVgs, type: 'scatter', mode: 'lines', name: 'I_D(Vgs)', line: { color: '#22C55E', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(34,197,94,0.1)' },
      { x: [Vth, Vth], y: [0, Math.max(...idVgs) * 1.2], type: 'scatter', mode: 'lines', name: 'V_th', line: { color: '#EF4444', width: 1.5, dash: 'dot' } }
    ], layout: layout('Transfer Characteristic I_D vs V_GS', { xaxis: { ...DARK.xaxis, title: 'V_GS (V)' }, yaxis: { ...DARK.yaxis, title: 'I_D (mA)' } }), config: CFG });
  }
}
