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

  it('still parses the other actions and rejects unknown ones', () => {
    expect(parseAction('step:120')).toEqual({ kind: 'step', frames: 120 });
    expect(parseAction('click:640;360')).toEqual({ kind: 'click', x: 640, y: 360 });
    expect(parseAction('pause')).toEqual({ kind: 'pause' });
    expect(() => parseAction('bogus:1')).toThrow(/Unknown action/);
  });
});
