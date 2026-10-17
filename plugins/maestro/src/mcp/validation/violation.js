'use strict';

/**
 * Build a validate_plan violation in its reported shape.
 *
 * @param {string} rule - Machine-readable rule identifier (e.g. `phase_count`)
 * @param {string} detail - Human-readable description of the violation
 * @param {'error'|'warning'} [severity='error'] - Violation severity
 * @returns {{ rule: string, detail: string, severity: string }}
 */
function violation(rule, detail, severity = 'error') {
  return { rule, detail, severity };
}

module.exports = { violation };
