import { isSloshing } from '../core/slosh';
import { DEFAULT_TUNING } from '../core/tuning';
import { currentSimulation } from './currentSimulation';
import { panelEnabled } from './debugMode';
import { tuningControl, type TuningControl } from './tuningControl';
import { PANEL_CSS } from './tuningPanelStyle';
import {
  LastThrowTracker,
  NO_THROW,
  measureFlipWindows,
  windowsReadout,
  type LastThrowReadout,
} from './tuningReadout';
import { TUNING_KEYS, parseNumber, stepFor, tuningJson, type TuningKey } from './tuningStore';

/*
 * The developer tuning panel: a plain HTML overlay (not Phaser, so it can use native inputs) that
 * lists every value of the tuning module as an editable field. Backquote shows and hides it. Edits
 * go through the `TuningControl`, which applies them from the next bottle and keeps them in
 * localStorage. It is installed in dev builds and with `?debug`, and nowhere else.
 *
 * While you work in the panel the game must not hear it: keys inside it stop at the panel instead
 * of reaching Phaser (which listens on the window), so typing a digit, Space, R or an arrow key in
 * a field never moves the power bar, throws, restarts the game or skips a result. Clicks and
 * touches are stopped the same way; Phaser already ignores a press while the pointer is off its
 * canvas, so this is a second guard, not the only one.
 */

export const PANEL_ID = 'tuning-panel';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

const LAST_THROW_FIELDS: readonly [keyof LastThrowReadout, string][] = [
  ['water', 'Water'],
  ['power', 'Power'],
  ['outcome', 'Outcome'],
  ['turns', 'Turns'],
  ['rotation', 'Rotation (turns)'],
];

/** The whole panel (hidden) added to the page, and what is needed to show and hide it. */
function buildPanel(control: TuningControl): { panel: HTMLElement; toggle: () => void } {
  // Top part: title, Copy and Reset, the water lock, the last throw and the flip window.
  const copy = el('button', {
    id: 'tuning-copy',
    type: 'button',
    textContent: 'Copy',
    title: 'Copy the full tuning as JSON, to paste into src/core/tuning.ts',
  });
  const reset = el('button', {
    id: 'tuning-reset',
    type: 'button',
    textContent: 'Reset',
    title: 'Put every value back to its default',
  });
  const status = el('div', { id: 'tuning-status', className: 'tp-status' });
  const json = el('textarea', { id: 'tuning-json', readOnly: true, hidden: true });

  const lockBox = el('input', { id: 'tuning-water-lock', type: 'checkbox' });
  const lockLevel = el('input', {
    id: 'tuning-water-level',
    type: 'number',
    min: '0',
    max: '1',
    step: '0.05',
    value: '0.5',
  });
  const lockLabel = el('label', { htmlFor: 'tuning-water-lock', textContent: 'Lock water at' });

  const lastThrow = el('dl', { id: 'tuning-last-throw' });
  const lastCells = new Map<keyof LastThrowReadout, HTMLElement>();
  for (const [field, label] of LAST_THROW_FIELDS) {
    const cell = el('dd', { id: `tuning-last-${field}` });
    lastCells.set(field, cell);
    lastThrow.append(el('dt', { textContent: label }), cell);
  }
  const windowButton = el('button', {
    id: 'tuning-window-button',
    type: 'button',
    textContent: 'Show flip window',
    title: 'Measure the bottle in the hand: the powers that flip it once (and twice) and land it',
  });
  const windowText = el('pre', { id: 'tuning-window' });

  const top = el(
    'div',
    { className: 'tp-top' },
    el('h2', {}, 'Tuning', el('small', { textContent: '` shows or hides this panel' })),
    el('div', { className: 'tp-line' }, copy, reset),
    status,
    json,
    el('div', { className: 'tp-line' }, lockBox, lockLabel, lockLevel),
    el('div', { className: 'tp-line' }, el('span', { textContent: 'Last throw' })),
    lastThrow,
    el('div', { className: 'tp-line' }, windowButton),
    windowText,
  );

  // The list: one row per tuning key, in the order of src/core/tuning.ts.
  const list = el('div', { className: 'tp-list' });
  const sloshSwitch = el('input', { id: 'tuning-sloshing-switch', type: 'checkbox' });
  sloshSwitch.title = 'Sloshing water';
  const rows = new Map<TuningKey, { row: HTMLElement; input: HTMLInputElement }>();
  for (const key of TUNING_KEYS) {
    const input = el('input', { id: `tuning-${key}`, type: 'number', step: String(stepFor(key)) });
    input.setAttribute('data-key', key);
    const hint = el('span', {
      className: 'tp-default',
      textContent: `default ${DEFAULT_TUNING[key]}`,
    });
    const row = el(
      'div',
      { className: 'tp-row' },
      el('label', { htmlFor: input.id, textContent: key, title: key }),
      input,
      hint,
    );
    rows.set(key, { row, input });
    if (key === 'sloshing') {
      // The sloshing switch (F025): a checkbox beside the number, both editing the same value.
      sloshSwitch.addEventListener('change', () =>
        control.set('sloshing', sloshSwitch.checked ? 1 : 0),
      );
      row.insertBefore(sloshSwitch, input);
    }
    list.append(row);
  }

  const panel = el('aside', { id: PANEL_ID, hidden: true }, top, list);
  panel.setAttribute('aria-label', 'Tuning panel');

  // Keep the game from hearing the panel (see the note at the top of the file).
  for (const type of ['keydown', 'keyup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
    panel.addEventListener(type, (event) => event.stopPropagation());
  }
  // A key held down in the game when the focus moves here would never report its key-up.
  panel.addEventListener('focusin', () => currentSimulation()?.powerMeter.release());

  // Show the control's state in the fields. A field being typed in keeps its text unless the
  // value really changed somewhere else, so the cursor never jumps while typing "9.5".
  const refresh = (): void => {
    const values = control.values();
    for (const [key, { row, input }] of rows) {
      row.classList.toggle('changed', control.isEdited(key));
      if (document.activeElement !== input || parseNumber(input.value) !== values[key]) {
        input.value = String(values[key]);
      }
    }
    sloshSwitch.checked = isSloshing(values);
    const lock = control.waterLock();
    lockBox.checked = lock !== null;
    if (lock !== null && document.activeElement !== lockLevel) lockLevel.value = String(lock);
  };
  // A measurement of the flip window doesn't outlive a change of the tuning or the water lock.
  control.subscribe(() => {
    refresh();
    windowText.textContent = '';
  });
  refresh();

  list.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    const key = input.getAttribute('data-key');
    const value = parseNumber(input.value);
    if (key && value !== null) control.set(key, value);
  });
  // Leaving a field shows the value that is really in effect (empty or invalid text is not applied).
  list.addEventListener('change', refresh);

  reset.addEventListener('click', () => {
    control.reset();
    json.hidden = true;
    status.textContent = 'Every value is back to its default.';
  });
  copy.addEventListener('click', async () => {
    json.value = tuningJson(control.values());
    json.hidden = false;
    try {
      await navigator.clipboard.writeText(json.value);
      status.textContent = 'Copied. Paste it into src/core/tuning.ts.';
    } catch {
      json.focus();
      json.select();
      status.textContent = 'Copy it from the box (Ctrl+C), then paste it into src/core/tuning.ts.';
    }
  });

  // The water lock: the box turns it on with the level in the field; typing a level moves it.
  lockBox.addEventListener('change', () => {
    control.setWaterLock(lockBox.checked ? (parseNumber(lockLevel.value) ?? 0.5) : null);
  });
  lockLevel.addEventListener('input', () => {
    const level = parseNumber(lockLevel.value);
    if (lockBox.checked && level !== null) control.setWaterLock(level);
  });
  lockLevel.addEventListener('change', refresh);

  windowButton.addEventListener('click', () => {
    const sim = currentSimulation();
    if (!sim) {
      windowText.textContent = 'No game is running.';
      return;
    }
    const water = sim.snapshot().bottle.water;
    windowText.textContent = windowsReadout(water, measureFlipWindows(water, sim.tuning));
  });

  // The last throw, kept up to date every frame (also while hidden, so no outcome is missed).
  const tracker = new LastThrowTracker();
  const frame = (): void => {
    const sim = currentSimulation();
    const readout = sim ? tracker.read(sim.snapshot()) : NO_THROW;
    if (!panel.hidden) {
      for (const [field, cell] of lastCells) {
        if (cell.textContent !== readout[field]) cell.textContent = readout[field];
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const toggle = (): void => {
    panel.hidden = !panel.hidden;
    if (panel.hidden && panel.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur(); // give the keys back to the game
    }
  };
  return { panel, toggle };
}

/**
 * Add the panel to the page, hidden, and bind Backquote to show and hide it. Does nothing outside a
 * dev build or `?debug`, and does nothing twice.
 */
export function installTuningPanel(control: TuningControl = tuningControl()): void {
  if (!panelEnabled() || document.getElementById(PANEL_ID)) return;
  const { panel, toggle } = buildPanel(control);
  document.head.append(el('style', { textContent: PANEL_CSS }));
  document.body.append(panel);
  // In the capture phase, so Backquote also works with the focus in a field (and types no backtick).
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.code !== 'Backquote' || event.repeat) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      toggle();
    },
    true,
  );
}
