import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Windows PowerShell 5.1 treats UTF-8 without BOM as the system ANSI codepage.
test('publish.ps1 is UTF-8 with BOM for Windows PowerShell 5.1', () => {
  const bytes = readFileSync(new URL('../scripts/publish.ps1', import.meta.url));
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.doesNotThrow(() => new TextDecoder('utf-8', {fatal: true}).decode(bytes));
});
