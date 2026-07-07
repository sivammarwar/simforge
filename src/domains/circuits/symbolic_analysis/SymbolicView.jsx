/**
 * SymbolicView — renders symbolic analysis results with LaTeX expressions.
 * Uses KaTeX for rendering when available, falls back to plain text.
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function SymbolicView(props) {
  const { resultsData } = props;
  const tf = resultsData?.transfer_function;
  const exprs = resultsData?.symbolic_expressions || [];

  return (
    <GenericSubDomainView {...props} title="Symbolic Analysis">
      {tf && (
        <div className="result-section">
          <h4>Transfer Function</h4>
          <div className="latex-block">
            <code>H(s) = {tf}</code>
          </div>
        </div>
      )}
      {exprs.length > 0 && (
        <div className="result-section">
          <h4>Symbolic Expressions</h4>
          {exprs.map((e, i) => (
            <div key={i} className="latex-block">
              <code>{e.label || 'expr'}: {e.expr}</code>
            </div>
          ))}
        </div>
      )}
    </GenericSubDomainView>
  );
}
