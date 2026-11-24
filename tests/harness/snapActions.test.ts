import { describe, expect, it } from 'vitest';
import { parseAction, parseCallArg } from '../../scripts/snapActions';

describe('snap call: arguments', () => {
  it('parses numbers, booleans and plain strings', () => {
    expect(parseCallArg('120')).toBe(120);
    expect(parseCallArg('-0.5')).toBe(-0.5);
    expect(parseCallArg('true')).toBe(true);
    expect(parseCallArg('false')).toBe(false);
    expect(parseCallArg('Game')).toBe('Game');
    expect(parseCallArg(' 7 ')).toBe(7);
  });

  it('keeps things that only look numeric or boolean as strings', () => {
    expect(parseCallArg('True')).toBe('True');
    expect(parseCallArg('Infinity')).toBe('Infinity');
    expect(parseCallArg('NaN')).toBe('NaN');
    expect(parseCallArg('12px')).toBe('12px');
  });
});

describe('snap call: action', () => {
  it('splits the method and its arguments on ";"', () => {
    expect(parseAction('call:step;120')).toEqual({ kind: 'call', method: 'step', args: [120] });
    expect(parseAction('call:startScene;Game')).toEqual({
      kind: 'call',
      method: 'startScene',
      args: ['Game'],
    });
    expect(parseAction('call:setThing;3;true;x')).toEqual({
      kind: 'call',
      method: 'setThing',
      args: [3, true, 'x'],
    });
  });

  it('allows a call without arguments', () => {
    expect(parseAction('call:pause')).toEqual({ kind: 'call', method: 'pause', args: [] });
  });

  it('rejects a missing method, a bad method name and empty arguments', () => {
    expect(() => parseAction('call')).toThrow(/missing value/);
    expect(() => parseAction('call:;1')).toThrow(/method/);
    expect(() => parseAction('call:a.b')).toThrow(/method/);
    expect(() => parseAction('call:step;')).toThrow(/empty argument/);
    expect(() => parseAction('call:step;1;;2')).toThrow(/empty argument/);
  });

  it('parses the mouse actions: mousedown, mousemove with its time, and mouseup', () => {
    expect(parseAction('mousedown:280;410')).toEqual({ kind: 'mousedown', x: 280, y: 410 });
    expect(parseAction('mousemove:280;210;100')).toEqual({
      kind: 'mousemove',
      x: 280,
      y: 210,
      ms: 100,
    });
    expect(parseAction('mousemove:5;6;0')).toEqual({ kind: 'mousemove', x: 5, y: 6, ms: 0 });
    expect(parseAction('mouseup')).toEqual({ kind: 'mouseup' });
  });

  it('rejects mouse actions with the wrong numbers', () => {
    expect(() => parseAction('mousedown')).toThrow(/2 number/);
    expect(() => parseAction('mousedown:280')).toThrow(/2 number/);
    expect(() => parseAction('mousemove:280;210')).toThrow(/3 number/);
    expect(() => parseAction('mousemove:280;210;x')).toThrow(/3 number/);
    expect(() => parseAction('mousemove:280;210;-5')).toThrow(/negative/);
  });

  it('still parses the other actions and rejects unknown ones', () => {
    expect(parseAction('step:120')).toEqual({ kind: 'step', frames: 120 });
    expect(parseAction('click:640;360')).toEqual({ kind: 'click', x: 640, y: 360 });
    expect(parseAction('pause')).toEqual({ kind: 'pause' });
    expect(() => parseAction('bogus:1')).toThrow(/Unknown action/);
  });
});

describe('snap touch actions (F038)', () => {
  it('parses tap, touchdown, touchmove and touchup', () => {
    expect(parseAction('tap:640;360')).toEqual({ kind: 'tap', x: 640, y: 360 });
    expect(parseAction('touchdown:280;386')).toEqual({ kind: 'touchdown', x: 280, y: 386 });
    expect(parseAction('touchmove:280;286;100')).toEqual({
      kind: 'touchmove',
      x: 280,
      y: 286,
      ms: 100,
    });
    expect(parseAction('touchup')).toEqual({ kind: 'touchup' });
  });

  it('rejects malformed ones', () => {
    expect(() => parseAction('tap:640')).toThrow();
    expect(() => parseAction('touchdown:1;')).toThrow();
    expect(() => parseAction('touchmove:1;2')).toThrow();
    expect(() => parseAction('touchmove:1;2;-5')).toThrow(/negative/);
    expect(() => parseAction('touchmove:a;2;5')).toThrow();
  });
});
