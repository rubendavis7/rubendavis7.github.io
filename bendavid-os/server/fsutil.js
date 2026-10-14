'use strict';
// File helpers. Windows can briefly lock a file while antivirus, search
// indexing, or OneDrive touches it; a plain rename then fails with EPERM/EBUSY.
// writeFileAtomic writes a temp file and swaps it in, retrying briefly, so a
// save never leaves a half-written file and a short lock doesn't fail the save.

const fs = require('fs');

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);
const MAX_ATTEMPTS = 10;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      if (!RETRYABLE.has(err.code) || attempt >= MAX_ATTEMPTS) {
        try { fs.unlinkSync(tmp); } catch { /* already gone */ }
        throw err;
      }
      sleepSync(attempt * 20);
    }
  }
}

module.exports = { writeFileAtomic };
