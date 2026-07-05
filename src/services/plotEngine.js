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
