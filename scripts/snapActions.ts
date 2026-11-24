/** Parsing of `npm run snap --do "<actions>"` tokens. Kept apart from snap.ts so tests can import it. */

export type Action =
  | { kind: 'wait'; ms: number }
  | { kind: 'key' | 'down' | 'up'; key: string }
  | { kind: 'click'; x: number; y: number }
  | { kind: 'drag'; x1: number; y1: number; x2: number; y2: number; ms: number }
  | { kind: 'mousedown'; x: number; y: number }
  | { kind: 'mousemove'; x: number; y: number; ms: number }
  | { kind: 'mouseup' }
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'touchdown'; x: number; y: number }
  | { kind: 'touchmove'; x: number; y: number; ms: number }
  | { kind: 'touchup' }
  | { kind: 'scene'; key: string }
  | { kind: 'pause' | 'resume' }
  | { kind: 'step'; frames: number }
  | { kind: 'call'; method: string; args: CallArg[] }
  | { kind: 'shot' | 'state'; name: string };

export type CallArg = number | boolean | string;

/** A `call:` argument becomes a number, a boolean (true/false), or else stays a plain string. */
export function parseCallArg(raw: string): CallArg {
  const text = raw.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  const number = Number(text);
  if (text !== '' && Number.isFinite(number)) return number;
  return text;
}

export function parseAction(token: string): Action {
  const colon = token.indexOf(':');
  const kind = colon === -1 ? token : token.slice(0, colon);
  const arg = colon === -1 ? '' : token.slice(colon + 1);
  const numbers = (count: number): number[] => {
    const raw = arg.split(';').map((p) => p.trim());
    const parts = raw.map(Number);
    // An empty part would otherwise read as 0, so "tap:1;" must be rejected here.
    if (parts.length !== count || raw.includes('') || parts.some((p) => !Number.isFinite(p))) {
      throw new Error(`"${token}": expected ${count} number(s) separated by ";"`);
    }
    return parts;
  };
  const text = (): string => {
    if (!arg) throw new Error(`"${token}": missing value after ":"`);
    return arg;
  };

  switch (kind) {
    case 'wait':
      return { kind, ms: numbers(1)[0] };
    case 'key':
    case 'down':
    case 'up':
      return { kind, key: text() };
    case 'click': {
      const [x, y] = numbers(2);
      return { kind, x, y };
    }
    case 'drag': {
      const [x1, y1, x2, y2, ms] = numbers(5);
      return { kind, x1, y1, x2, y2, ms };
    }
    case 'mousedown': {
      const [x, y] = numbers(2);
      return { kind, x, y };
    }
    case 'mousemove': {
      const [x, y, ms] = numbers(3);
      if (ms < 0) throw new Error(`"${token}": the time can't be negative`);
      return { kind, x, y, ms };
    }
    case 'mouseup':
    case 'touchup':
      return { kind };
    case 'tap':
    case 'touchdown': {
      const [x, y] = numbers(2);
      return { kind, x, y };
    }
    case 'touchmove': {
      const [x, y, ms] = numbers(3);
      if (ms < 0) throw new Error(`"${token}": the time can't be negative`);
      return { kind, x, y, ms };
    }
    case 'scene':
      return { kind, key: text() };
    case 'pause':
    case 'resume':
      return { kind };
    case 'step':
      return { kind, frames: numbers(1)[0] };
    case 'call': {
      const [method, ...rest] = text().split(';');
      if (!/^[A-Za-z_]\w*$/.test(method.trim())) {
        throw new Error(`"${token}": expected call:<method>;<arg>;... with a method name`);
      }
      if (rest.some((a) => a.trim() === '')) {
        throw new Error(`"${token}": empty argument (arguments are separated by ";")`);
      }
      return { kind, method: method.trim(), args: rest.map(parseCallArg) };
    }
    case 'shot':
    case 'state':
      return { kind, name: text() };
    default:
      throw new Error(`Unknown action "${token}". Run "npm run snap -- --help" for the list.`);
  }
}
