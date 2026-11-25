/**
 * The look of the tuning panel (`tuningPanel.ts`): a column down the right edge of the page, over
 * the table's far end, so the bottle in the hand and the power bar on the left stay in view. The
 * controls stay at the top and the list of values scrolls underneath them.
 */
export const PANEL_CSS = `
#tuning-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 1000;
  display: flex; flex-direction: column; width: 300px; box-sizing: border-box;
  background: rgba(255, 255, 255, 0.97); color: #243040;
  border-left: 1px solid #9aa9bd; box-shadow: -2px 0 10px rgba(0, 0, 0, 0.18);
  font: 12px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
#tuning-panel[hidden] { display: none; }
#tuning-panel *, #tuning-panel *::before, #tuning-panel *::after { box-sizing: border-box; }
#tuning-panel .tp-top { padding: 8px 10px 6px; border-bottom: 1px solid #cdd7e2; }
#tuning-panel h2 { margin: 0 0 6px; font-size: 13px; }
#tuning-panel h2 small { margin-left: 6px; font-weight: normal; color: #6b7a90; }
#tuning-panel .tp-line { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
#tuning-panel .tp-line > span { flex: 1; }
#tuning-panel button {
  padding: 2px 10px; font: inherit; color: inherit; cursor: pointer;
  background: #eef3f9; border: 1px solid #9aa9bd; border-radius: 4px;
}
#tuning-panel button:hover { background: #dde8f4; }
#tuning-panel input[type="number"] {
  width: 84px; padding: 1px 4px; font: inherit; color: inherit;
  border: 1px solid #9aa9bd; border-radius: 3px; background: #fff;
}
#tuning-panel .tp-status { min-height: 1.35em; margin-top: 4px; color: #6b7a90; }
#tuning-panel textarea {
  width: 100%; height: 76px; margin-top: 4px; resize: vertical;
  font: 11px/1.3 ui-monospace, Consolas, monospace; color: inherit;
}
#tuning-panel dl { display: grid; grid-template-columns: auto 1fr; gap: 0 10px; margin: 4px 0 0; }
#tuning-panel dt { color: #6b7a90; }
#tuning-panel dd { margin: 0; font-variant-numeric: tabular-nums; }
#tuning-panel pre { margin: 6px 0 0; white-space: pre-wrap; font: 11px/1.35 ui-monospace, Consolas, monospace; }
#tuning-panel .tp-list { flex: 1; overflow-y: auto; padding: 4px 10px 12px; }
#tuning-panel .tp-row {
  display: grid; grid-template-columns: 1fr 84px; align-items: center; gap: 0 8px;
  padding: 2px 0 2px 6px; border-left: 3px solid transparent;
}
#tuning-panel .tp-row label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#tuning-panel .tp-row .tp-default { display: none; grid-column: 1 / -1; font-size: 10px; color: #6b7a90; }
#tuning-panel .tp-row.changed { border-left-color: #2f7fd6; background: #eef5fd; }
#tuning-panel .tp-row.changed label { font-weight: 600; }
#tuning-panel .tp-row.changed .tp-default { display: block; }
#tuning-toggle {
  position: fixed; left: 4px; bottom: 4px; z-index: 1001; width: 44px; height: 44px; padding: 0;
  font: 24px/1 system-ui, sans-serif; color: #243040; cursor: pointer;
  background: rgba(255, 255, 255, 0.85); border: 1px solid #9aa9bd; border-radius: 8px;
}
/* On a phone the whole panel scrolls (its top part alone could fill a 360 px screen), with fields big enough for a finger. */
#tuning-panel.tp-touch { overflow-y: auto; width: min(300px, 62vw); }
#tuning-panel.tp-touch .tp-top, #tuning-panel.tp-touch .tp-list { flex: none; }
#tuning-panel.tp-touch .tp-list { overflow: visible; }
#tuning-panel.tp-touch input[type="number"] { height: 36px; font-size: 16px; }
#tuning-panel.tp-touch button { min-height: 36px; }
`;
