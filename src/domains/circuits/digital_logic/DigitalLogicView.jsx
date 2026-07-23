/**
 * DigitalLogicView — renders digital logic results with truth tables,
 * the gate-level schematic, and generated Verilog.
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function DigitalLogicView(props) {
  const { resultsData } = props;
  const truthTable = resultsData?.truth_table || [];
  const boolExpr = resultsData?.boolean_expression;
  const simplified = resultsData?.simplified_expression;
  const gateCount = resultsData?.gate_count;
  const schematicSvg = resultsData?.schematic_svg;
  const verilogBehavioral = resultsData?.verilog_behavioral;
  const verilogStructural = resultsData?.verilog_structural;

  return (
    <GenericSubDomainView {...props} title="Digital Logic Analysis">
      {boolExpr && (
        <div className="result-section">
          <h4>Boolean Expression</h4>
          <div className="latex-block"><code>Y = {boolExpr}</code></div>
        </div>
      )}
      {simplified && (
        <div className="result-section">
          <h4>Simplified (SOP)</h4>
          <div className="latex-block"><code>Y = {simplified}</code></div>
        </div>
      )}
      {gateCount > 0 && (
        <div className="result-section">
          <p>Estimated gate count: <strong>{gateCount}</strong></p>
        </div>
      )}
      {schematicSvg && (
        <div className="result-section">
          <h4>Gate-Level Schematic</h4>
          <div
            className="gate-schematic-container"
            dangerouslySetInnerHTML={{ __html: schematicSvg }}
          />
        </div>
      )}
      {(verilogBehavioral || verilogStructural) && (
        <div className="result-section">
          <h4>Verilog</h4>
          {verilogBehavioral && (
            <>
              <p className="verilog-subheading">Behavioral</p>
              <pre className="area-report">{verilogBehavioral}</pre>
            </>
          )}
          {verilogStructural && (
            <>
              <p className="verilog-subheading">Structural</p>
              <pre className="area-report">{verilogStructural}</pre>
            </>
          )}
        </div>
      )}
      {truthTable.length > 0 && (
        <div className="result-section">
          <h4>Truth Table</h4>
          <table className="truth-table">
            <thead>
              <tr>
                {Object.keys(truthTable[0]).map(col => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {truthTable.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((val, j) => (
                    <td key={j} className={val === 1 ? 'logic-high' : 'logic-low'}>{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GenericSubDomainView>
  );
}
