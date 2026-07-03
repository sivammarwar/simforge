import React, { useState } from 'react';
import { Edit, History, AlertCircle, HelpCircle, Check, X, ChevronDown, ChevronRight, Play, Zap } from 'lucide-react';
import { parseUnit, formatUnit } from '../services/solvers';

export default function ModelPane({
  activeDomain,
  modelData,  // input_file: {filename, content}
  parameters,  // array of {section, field, value, unit, tag, editable, file_anchor}
  onUpdateField, // (section, field, newValue)
  onConfirmAndRun,
  solverProgress, // { stage, percent, elapsed }
  onCancelSimulation,
  versionHistory, // array of past models
  onRestoreVersion,
  rawSolverInput, // compiled netlist text
  livePlaygroundActive,
  onTogglePlayground
}) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedSection, setExpandedSection] = useState({ assumptions: false, solverInput: false });
  const [activeTooltip, setActiveTooltip] = useState(null); // { category, field }
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [changedFields, setChangedFields] = useState(new Set()); // Set of {section,field} strings
  const [pendingChanges, setPendingChanges] = useState({}); // { fieldKey: newValue } - only commit on button click

  const getSliderBounds = (fieldName) => {
    const fn = fieldName.toLowerCase();
    // Circuits
    if (fn.includes('voltage') || fn.includes('v(')) return { min: 0.1, max: 50, step: 0.1, unit: 'V' };
    if (fn.includes('current') || fn.includes('i(')) return { min: 0.01, max: 10, step: 0.01, unit: 'A' };
    if (fn.includes('resistance') || fn.includes('resistor') || fn.includes('r(')) return { min: 1, max: 100000, step: 10, unit: 'Ω' };
    if (fn.includes('inductor') || fn.includes('l(')) return { min: 0.1, max: 1000, step: 0.1, unit: 'µH' };
    if (fn.includes('capacitor') || fn.includes('c(')) return { min: 1, max: 10000, step: 1, unit: 'µF' };
    if (fn.includes('esr') || fn.includes('impedance')) return { min: 0.1, max: 100, step: 0.1, unit: 'Ω' };
    if (fn.includes('freq') || fn.includes('frequency')) return { min: 1, max: 100000, step: 10, unit: 'Hz' };
    if (fn.includes('duration') || fn.includes('time')) return { min: 0.001, max: 10, step: 0.001, unit: 's' };
    
    // Structural
    if (fn.includes('length')) return { min: 1, max: 10000, step: 1, unit: 'mm' };
    if (fn.includes('width')) return { min: 1, max: 1000, step: 1, unit: 'mm' };
    if (fn.includes('height') || fn.includes('thickness')) return { min: 0.1, max: 500, step: 0.1, unit: 'mm' };
    if (fn.includes('force') || fn.includes('load') || fn.includes('magnitude')) return { min: 1, max: 10000, step: 1, unit: 'N' };
    if (fn.includes('pressure')) return { min: 0.1, max: 100, step: 0.1, unit: 'MPa' };
    if (fn.includes('modulus') || fn.includes('young')) return { min: 1, max: 300, step: 1, unit: 'GPa' };
    
    // Fluids
    if (fn.includes('diameter')) return { min: 1, max: 1000, step: 1, unit: 'mm' };
    if (fn.includes('velocity') || fn.includes('speed')) return { min: 0.1, max: 100, step: 0.1, unit: 'm/s' };
    if (fn.includes('flow') || fn.includes('rate')) return { min: 0.1, max: 1000, step: 0.1, unit: 'L/min' };
    if (fn.includes('density')) return { min: 500, max: 2000, step: 10, unit: 'kg/m³' };
    if (fn.includes('viscosity')) return { min: 0.001, max: 1, step: 0.001, unit: 'Pa·s' };
    
    // Thermal
    if (fn.includes('temperature') || fn.includes('temp')) return { min: -50, max: 500, step: 1, unit: '°C' };
    if (fn.includes('power') || fn.includes('heat')) return { min: 1, max: 10000, step: 1, unit: 'W' };
    if (fn.includes('conductivity') || fn.includes('k')) return { min: 0.1, max: 500, step: 0.1, unit: 'W/m·K' };
    
    // Generic numeric fallback
    const numValue = parseFloat(fieldName.replace(/[^0-9.-]/g, ''));
    if (!isNaN(numValue)) {
      const magnitude = Math.abs(numValue);
      if (magnitude < 1) return { min: magnitude * 0.1, max: magnitude * 10, step: magnitude * 0.1, unit: '' };
      if (magnitude < 100) return { min: magnitude * 0.1, max: magnitude * 10, step: magnitude * 0.1, unit: '' };
      return { min: magnitude * 0.1, max: magnitude * 10, step: magnitude * 0.1, unit: '' };
    }
    
    return null;
  };

  // Inline editing state
  const [editingField, setEditingField] = useState(null); // { category, field, value, unit }
  
  const handleEditClick = (category, field, valStr) => {
    // Extract numeric value and unit
    const numPart = parseFloat(valStr) || 0;
    const unitPart = valStr.replace(/[0-9.-]/g, '').trim();
    setEditingField({ category, field, value: numPart, unit: unitPart });
  };

  const saveInlineEdit = () => {
    if (!editingField) return;
    const { category, field, value, unit } = editingField;
    const formatted = `${value} ${unit}`.trim();
    
    // Tag should become confirmed (if it was inferred) or edited (if it was stated)
    const currentMeta = modelData[category]?.[field];
    const isStated = currentMeta?.tag === 'stated' || currentMeta?.tag === 'edited';
    const nextTag = isStated ? 'edited' : 'confirmed';

    onUpdateField(category, field, formatted, nextTag);
    
    // Track unsaved changes
    setChangedFields(prev => new Set([...prev, `${category}.${field}`]));
    setHasUnsavedChanges(true);
    
    setEditingField(null);
  };

  const getCompatibleUnits = (field) => {
    const fLower = field.toLowerCase();
    if (fLower.includes('voltage')) return ['V', 'mV', 'uV'];
    if (fLower.includes('current')) return ['A', 'mA', 'uA'];
    if (fLower.includes('inductor')) return ['µH', 'uH', 'mH', 'H'];
    if (fLower.includes('capacitor')) return ['µF', 'uF', 'nF', 'pF'];
    if (fLower.includes('esr') || fLower.includes('impedance')) return ['Ω', 'mΩ', 'kΩ'];
    if (fLower.includes('freq')) return ['kHz', 'MHz', 'Hz'];
    if (fLower.includes('duration')) return ['us', 'ms', 's'];
    if (fLower.includes('length') || fLower.includes('width') || fLower.includes('height') || fLower.includes('position')) return ['mm', 'cm', 'm'];
    if (fLower.includes('modulus')) return ['GPa', 'MPa', 'Pa'];
    if (fLower.includes('magnitude') || fLower.includes('load')) return ['N', 'kN'];
    if (fLower.includes('density')) return ['kg/m³'];
    if (fLower.includes('viscosity')) return ['Pa·s', 'mPa·s'];
    if (fLower.includes('velocity')) return ['m/s'];
    return [''];
  };

  const getTagColor = (tag) => {
    switch (tag) {
      case 'stated': return 'tag-stated';
      case 'inferred': return 'tag-inferred';
      case 'confirmed': return 'tag-confirmed';
      case 'edited': return 'tag-edited';
      case 'from memory': return 'tag-memory';
      case 'from datasheet': return 'tag-datasheet';
      case 'TRIZ edit': return 'tag-triz';
      default: return 'tag-default';
    }
  };

  const getCategoryTitle = (cat) => {
    return cat.replace(/_/g, ' ');
  };

  // Build model fields breakdown grouping
  const getDomainCategories = () => {
    const appendExisting = (base, optional) => [
      ...base,
      ...optional.filter(cat => modelData?.[cat] && !base.includes(cat))
    ];
    if (activeDomain === 'Physics') {
      return ['PROBLEM', 'MASSES', 'CONTACT', 'SPRING', 'MOTION', 'BODY', 'WAVE', 'DIAGRAM', 'SIMULATION'].filter(cat => modelData?.[cat]);
    } else if (activeDomain === 'Circuits') {
      return ['INPUT', 'OUTPUT', 'COMPONENTS', 'SIMULATION'];
    } else if (activeDomain === 'Structural') {
      return appendExisting(['GEOMETRY', 'MATERIAL', 'LOADING', 'SIMULATION'], ['MASSES', 'CONTACT', 'MOTION', 'SPRING', 'DIAGRAM']);
    } else if (activeDomain === 'Fluids') {
      return ['GEOMETRY', 'FLUID', 'BOUNDARY_CONDITIONS', 'SIMULATION'];
    } else if (activeDomain === 'Semiconductors') {
      return ['GEOMETRY', 'MATERIAL', 'BIASING', 'SIMULATION'];
    } else if (activeDomain === 'Aerospace') {
      return appendExisting(['GEOMETRY', 'PROPULSION', 'SIMULATION'], ['FLIGHT_CONDITIONS', 'AERODYNAMICS']);
    } else if (activeDomain === 'Thermal') {
      return ['HEAT_LOAD', 'TEMPERATURES', 'THERMAL_PATH', 'SIMULATION'];
    } else if (activeDomain === 'Control') {
      return ['PLANT', 'REQUIREMENTS', 'CONTROLLER', 'SIMULATION'];
    } else if (activeDomain === 'Materials') {
      return ['MATERIAL', 'LOADING', 'GEOMETRY', 'SIMULATION'].filter(cat => modelData?.[cat]);
    } else if (activeDomain === 'Power') {
      return ['INPUT', 'PERFORMANCE', 'SIMULATION'];
    }
    return [];
  };

  return (
    <div className="model-pane flex flex-col flex-1 relative">
      {/* Pane Header */}
      <div className="pane-header flex items-center justify-between">
        <span className="pane-title">Formulated Model</span>
        <div className="flex items-center gap-2">
          {modelData && (
            <>
              {/* Live Playground toggle */}
              <label className="flex items-center gap-1 text-[11px] font-semibold text-secondary mr-2" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={livePlaygroundActive}
                  onChange={onTogglePlayground}
                  style={{ width: '12px', height: '12px', cursor: 'pointer', marginRight: '4px' }}
                />
                <span style={{ color: livePlaygroundActive ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>Live Playground</span>
              </label>
              <button 
                className={`header-btn ${isEditMode ? 'active' : ''}`}
                onClick={() => setIsEditMode(!isEditMode)}
              >
                <Edit size={12} /> Edit
              </button>
              <button 
                className={`header-btn ${showHistory ? 'active' : ''}`}
                onClick={() => setShowHistory(!showHistory)}
              >
                <History size={12} /> History
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pane Workspace Layout */}
      <div className="flex-1 flex min-h-0 relative">
        <div className={`model-content-area flex-1 flex flex-col overflow-y-auto ${!modelData ? 'dimmed' : ''}`}>
          
          {/* STATE A: EMPTY */}
          {!modelData && (
            <div className="empty-state flex flex-col items-center justify-center flex-1">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 17v-4h6v4" />
                <path d="M12 9v4" />
                <circle cx="12" cy="7" r="1" />
              </svg>
              <span className="empty-state-text mt-3">
                Describe a system in the Reasoning pane to begin.
              </span>
            </div>
          )}

          {/* MODEL DATA VIEW - render from parameters array */}
          {modelData && (
            <div className="model-data-container flex-1 flex flex-col">
              
              {/* System Type Header */}
              <div className="system-type-block">
                <span className="system-type-label">SYSTEM TYPE</span>
                <span className="system-type-value">{modelData.system_type || 'Unknown'}</span>
              </div>

              {/* Parameters */}
              <div className="fields-groups p-3 flex-1">
                {parameters && parameters.length > 0 ? (
                  <>
                    {parameters.map((param, idx) => {
                      const isEditingThis = editingField && editingField.section === param.section && editingField.field === param.field;
                      const bounds = getSliderBounds(param.field);
                      const fieldKey = `${param.section}.${param.field}`;
                      const isChanged = changedFields.has(fieldKey);
                      const hasSlider = bounds && param.editable;
                      
                      return (
                        <div key={idx} className={`flex flex-col border-b border-[#252A32]/30 pb-2 ${isChanged ? 'changed-field' : ''}`}>
                          <div className="param-row flex items-center justify-between">
                            <span className="param-name flex items-center gap-1">
                              {param.field}
                              {isChanged && <span className="changed-indicator">●</span>}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`param-value ${param.editable ? 'editable' : ''}`}>
                                {isEditingThis ? (
                                  <input
                                    type="number"
                                    value={editingField.value}
                                    onChange={(e) => setEditingField({ ...editingField, value: parseFloat(e.target.value) })}
                                    className="inline-edit-input"
                                    autoFocus
                                    onBlur={() => saveInlineEdit()}
                                    onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                                  />
                                ) : (
                                  <span className="value-text">
                                    {pendingChanges[fieldKey] !== undefined ? pendingChanges[fieldKey] : param.value} {param.unit || ''}
                                  </span>
                                )}
                              </span>
                              {!hasSlider && param.editable && (
                                <button 
                                  className="param-edit-btn"
                                  onClick={() => isEditingThis ? saveInlineEdit() : handleEditClick(param.section, param.field, `${param.value} ${param.unit || ''}`)}
                                >
                                  {isEditingThis ? <Check size={12} /> : <Edit size={12} />}
                                </button>
                              )}
                            </div>
                          </div>
                          {hasSlider && !isEditingThis && (
                            <div className="param-slider-container mt-2">
                              <input
                                type="range"
                                min={bounds.min}
                                max={bounds.max}
                                step={bounds.step}
                                value={parseFloat(pendingChanges[fieldKey] !== undefined ? pendingChanges[fieldKey] : param.value) || bounds.min}
                                onChange={(e) => {
                                  const newValue = parseFloat(e.target.value);
                                  
                                  // Store pending change locally - don't commit yet
                                  setPendingChanges(prev => ({ ...prev, [fieldKey]: newValue }));
                                  
                                  // Track as changed
                                  setChangedFields(prev => new Set([...prev, fieldKey]));
                                  setHasUnsavedChanges(true);
                                }}
                                className="param-slider"
                              />
                              <div className="slider-labels flex justify-between text-[10px] text-secondary mt-1">
                                <span>{bounds.min} {bounds.unit}</span>
                                <span>{bounds.max} {bounds.unit}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Continue and Run Simulation button */}
                    {hasUnsavedChanges && (
                      <div className="run-simulation-bar mt-4 p-3 bg-[#1A1D21] border border-[#252A32] rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap size={14} className="text-amber" />
                            <span className="text-xs text-secondary">
                              {changedFields.size} parameter{changedFields.size > 1 ? 's' : ''} changed
                            </span>
                          </div>
                          <button 
                            className="run-sim-btn flex items-center gap-2 px-3 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white text-xs font-semibold rounded transition-colors"
                            onClick={() => {
                              // Commit all pending changes
                              Object.entries(pendingChanges).forEach(([fieldKey, newValue]) => {
                                const param = parameters.find(p => `${p.section}.${p.field}` === fieldKey);
                                if (param) {
                                  const formatted = `${newValue} ${param.unit || ''}`.trim();
                                  onUpdateField(param.section, param.field, formatted);
                                }
                              });
                              
                              // Clear pending changes
                              setPendingChanges({});
                              setHasUnsavedChanges(false);
                              setChangedFields(new Set());
                              
                              // Run simulation
                              onConfirmAndRun(true);
                            }}
                          >
                            <Play size={12} />
                            Continue and Run Simulation
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-secondary text-sm p-4">
                    No parameters available
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Solver Input View */}
          {modelData && expandedSection.solverInput && (
            <div className="solver-input-view flex-1 flex flex-col">
              <div className="solver-input-header flex items-center justify-between p-3 border-b border-[#252A32]">
                <span className="text-xs font-semibold text-secondary">SOLVER INPUT FILE</span>
                <button 
                  className="text-xs text-secondary hover:text-primary"
                  onClick={() => setExpandedSection({ ...expandedSection, solverInput: false })}
                >
                  Close
                </button>
              </div>
              <pre className="flex-1 p-3 text-xs font-mono overflow-auto" style={{ color: 'var(--text-secondary)' }}>
                {rawSolverInput}
              </pre>
            </div>
          )}

        </div>

        {/* History Sidebar */}
        {showHistory && (
          <div className="history-sidebar flex flex-col border-l border-[#252A32]">
            <div className="history-header p-3 border-b border-[#252A32]">
              <span className="text-xs font-semibold">Version History</span>
            </div>
            <div className="history-list flex-1 overflow-y-auto p-2">
              {versionHistory && versionHistory.length > 0 ? (
                versionHistory.map((entry, idx) => (
                  <div key={idx} className="history-entry p-2 border-b border-[#252A32]/30 cursor-pointer hover:bg-[#1A1D21]">
                    <div className="text-xs text-secondary">{entry.timestamp}</div>
                    <div className="text-xs text-primary mt-1">{entry.description || 'Version ' + (idx + 1)}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-secondary p-2">No history available</div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
