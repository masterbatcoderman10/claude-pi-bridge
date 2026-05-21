import { describe, it, expect } from 'vitest';
import { serializeJsonLine, attachJsonlLineReader } from '../src/vendor/jsonl.js';
import { Readable } from 'node:stream';

describe('jsonl', () => {
  describe('serializeJsonLine', () => {
    it('adds newline after JSON', () => {
      const line = serializeJsonLine({ foo: 'bar' });
      expect(line).toBe('{"foo":"bar"}\n');
    });

    it('serializes arrays', () => {
      const line = serializeJsonLine([1, 2, 3]);
      expect(line).toBe('[1,2,3]\n');
    });

    it('serializes primitives', () => {
      expect(serializeJsonLine(42)).toBe('42\n');
      expect(serializeJsonLine('hello')).toBe('"hello"\n');
    });
  });

  describe('attachJsonlLineReader', () => {
    it('correctly splits lines across chunks', async () => {
      const lines: string[] = [];
      const stream = new Readable({ read() {} });
      attachJsonlLineReader(stream, (line) => lines.push(line));

      stream.push('{"a":1}\n{"b":2}\n');
      stream.push(null);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    });

    it('handles partial lines at chunk boundary', async () => {
      const lines: string[] = [];
      const stream = new Readable({ read() {} });
      attachJsonlLineReader(stream, (line) => lines.push(line));

      stream.push('{"part":');
      stream.push('"ial"}\n{"next":1}\n');
      stream.push(null);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(lines).toEqual(['{"part":"ial"}', '{"next":1}']);
    });

    it('handles trailing data without newline', async () => {
      const lines: string[] = [];
      const stream = new Readable({ read() {} });
      attachJsonlLineReader(stream, (line) => lines.push(line));

      stream.push('{"trailing":true}');
      stream.push(null);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(lines).toEqual(['{"trailing":true}']);
    });

    it('handles empty stream', async () => {
      const lines: string[] = [];
      const stream = new Readable({ read() {} });
      attachJsonlLineReader(stream, (line) => lines.push(line));

      stream.push(null);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(lines).toEqual([]);
    });

    it('strips carriage returns', async () => {
      const lines: string[] = [];
      const stream = new Readable({ read() {} });
      attachJsonlLineReader(stream, (line) => lines.push(line));

      stream.push('{"cr":true}\r\n');
      stream.push(null);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(lines).toEqual(['{"cr":true}']);
    });

    it('cleanup removes listeners', () => {
      const stream = new Readable({ read() {} });
      const cleanup = attachJsonlLineReader(stream, () => {});
      expect(stream.listenerCount('data')).toBe(1);
      expect(stream.listenerCount('end')).toBe(1);

      cleanup();
      expect(stream.listenerCount('data')).toBe(0);
      expect(stream.listenerCount('end')).toBe(0);
    });
  });
});
