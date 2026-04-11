import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normaliseDirectoryName } from "../../lib/ingestion/directory/miner";

describe("normaliseDirectoryName", () => {
  it("converts SURNAME, FIRSTNAME to Firstname Surname", () => {
    assert.equal(normaliseDirectoryName("DUPLAN, ERIC"), "Eric Duplan");
    assert.equal(normaliseDirectoryName("DU TOIT, TERTIA"), "Tertia Du Toit");
    assert.equal(normaliseDirectoryName("DE ANDRADE, ROGERIO"), "Rogerio De Andrade");
  });

  it("passes through already-normalised names", () => {
    assert.equal(normaliseDirectoryName("Diane Victor"), "Diane Victor");
    assert.equal(normaliseDirectoryName("Diek Grobler"), "Diek Grobler");
  });

  it("returns null for too-short or invalid input", () => {
    assert.equal(normaliseDirectoryName("AB"), null);
    assert.equal(normaliseDirectoryName(""), null);
  });
});
