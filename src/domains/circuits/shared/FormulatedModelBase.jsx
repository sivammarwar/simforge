/**
 * FormulatedModelBase
 * ===================
 * Shared editable-parameter-list component used by all sub-domain views.
 * Renders parameters with inline editing, sliders where applicable, and
 * a "Continue & Run Simulation" button that batches pending edits.
 *
 * This is the shared base — sub-domain views can use it directly or wrap
 * it with domain-specific extensions.
 */
import React, { useState, useCallback } from 'react';

export default function FormulatedModelBase({
  parameters = [],
  onUpdateField,
  onApplyChangesAndRun,
  isSimulationRunning = false,
  title = 'Formulated Model',
}) {
  const [pendingEdits, setPendingEdits] = useState({});

  const handleFieldChange = useCallback((param, newValue) => {
    setPendingEdits(prev => ({
      ...prev,
      [param.field]: { ...param, value: newValue },
    }));
  }, []);

  const handleApply = useCallback(() => {
    if (Object.keys(pendingEdits).length === 0) return;
    const updates = Object.values(pendingEdits);
    if (onApplyChangesAndRun) {
      onApplyChangesAndRun(updates);
    }
    setPendingEdits({});
  }, [pendingEdits, onApplyChangesAndRun]);

  const hasEdits = Object.keys(pendingEdits).length > 0;

  return (
    <div className="formulated-model-base">
      <div className="model-header">
        <h3>{title}</h3>
        {hasEdits && (
          <button
            className="apply-changes-btn"
            onClick={handleApply}
            disabled={isSimulationRunning}
          >
            {isSimulationRunning ? 'Running…' : `Continue & Run Simulation (${Object.keys(pendingEdits).length})`}
          </button>
        )}
      </div>
      {parameters.length === 0 ? (
        <div className="model-empty">Describe a circuit to populate the model.</div>
      ) : (
        <div className="model-params">
          {parameters.map((param) => {
            const edited = pendingEdits[param.field];
            const currentValue = edited ? edited.value : param.value;
            const isEdited = !!edited;
            return (
              <div key={param.field} className={`model-param ${isEdited ? 'edited' : ''}`}>
                <label className="param-label">{param.field}</label>
                <input
                  className="param-input"
                  type="text"
                  value={currentValue ?? ''}
                  onChange={(e) => handleFieldChange(param, e.target.value)}
                  disabled={isSimulationRunning}
                />
                {param.unit && <span className="param-unit">{param.unit}</span>}
                {isEdited && <span className="param-tag">edited</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
