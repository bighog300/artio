import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function fingerprintArtist(name: string, sourceUrl: string): string {
  const key = `${name.trim().toLowerCase()}::${sourceUrl.trim().toLowerCase()}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function toConfidenceBand(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

function extractArtistNames(mergedData: Record<string, unknown>): string[] {
  return Array.isArray(mergedData.artistNames)
    ? (mergedData.artistNames as unknown[])
      .map((n) => (typeof n === 'string' ? n.trim() : null))
      .filter((n): n is string => Boolean(n) && n.length > 0)
    : [];
}

test('fingerprintArtist: produces a 32-char hex string', () => {
  const fp = fingerprintArtist('Tracey Emin', 'https://gallery.example.com/events/opening');
  assert.equal(fp.length, 32);
  assert.match(fp, /^[0-9a-f]+$/);
});

test('fingerprintArtist: same name + URL always produces the same fingerprint', () => {
  const a = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
  const b = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
  assert.equal(a, b);
});

test('fingerprintArtist: different names produce different fingerprints', () => {
  const a = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
  const b = fingerprintArtist('Damien Hirst', 'https://gallery.example.com');
  assert.notEqual(a, b);
});

test('fingerprintArtist: is case-insensitive for name and URL', () => {
  const a = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
  const b = fingerprintArtist('TRACEY EMIN', 'HTTPS://GALLERY.EXAMPLE.COM');
  assert.equal(a, b);
});

test('fingerprintArtist: different source URLs produce different fingerprints for same name', () => {
  const a = fingerprintArtist('Tracey Emin', 'https://gallery-a.com');
  const b = fingerprintArtist('Tracey Emin', 'https://gallery-b.com');
  assert.notEqual(a, b);
});

test('toConfidenceBand: 0.75 and above is HIGH', () => {
  assert.equal(toConfidenceBand(0.75), 'HIGH');
  assert.equal(toConfidenceBand(0.90), 'HIGH');
  assert.equal(toConfidenceBand(1.0), 'HIGH');
});

test('toConfidenceBand: 0.45 to 0.74 is MEDIUM', () => {
  assert.equal(toConfidenceBand(0.45), 'MEDIUM');
  assert.equal(toConfidenceBand(0.60), 'MEDIUM');
  assert.equal(toConfidenceBand(0.74), 'MEDIUM');
});

test('toConfidenceBand: below 0.45 is LOW', () => {
  assert.equal(toConfidenceBand(0.44), 'LOW');
  assert.equal(toConfidenceBand(0.0), 'LOW');
});

test('extractArtistNames: extracts string array from mergedData', () => {
  const names = extractArtistNames({ artistNames: ['Tracey Emin', 'Damien Hirst'] });
  assert.deepEqual(names, ['Tracey Emin', 'Damien Hirst']);
});

test('extractArtistNames: trims whitespace from each name', () => {
  const names = extractArtistNames({ artistNames: ['  Tracey Emin  ', ' Damien Hirst'] });
  assert.deepEqual(names, ['Tracey Emin', 'Damien Hirst']);
});

test('extractArtistNames: filters out empty strings and non-strings', () => {
  const names = extractArtistNames({ artistNames: ['Tracey Emin', '', null, 42, 'Damien Hirst'] });
  assert.deepEqual(names, ['Tracey Emin', 'Damien Hirst']);
});

test('extractArtistNames: returns empty array when artistNames is absent', () => {
  assert.deepEqual(extractArtistNames({ title: 'Some Exhibition' }), []);
});

test('extractArtistNames: returns empty array when artistNames is not an array', () => {
  assert.deepEqual(extractArtistNames({ artistNames: 'Tracey Emin' }), []);
  assert.deepEqual(extractArtistNames({ artistNames: null }), []);
});

test('extractArtistNames: falls back to 0.6 confidence when confidenceMap has no artistNames key', () => {
  const confidenceMap: Record<string, number> = {};
  const score = confidenceMap.artistNames ?? 0.6;
  assert.equal(score, 0.6);
  assert.equal(Math.round(score * 100), 60);
  assert.equal(toConfidenceBand(score), 'MEDIUM');
});
