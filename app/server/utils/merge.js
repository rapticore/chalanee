'use strict';

// CH-H02: prototype-pollution-vulnerable deep merge.
// Walks `for (const k in src)` without guarding __proto__ / constructor / prototype.
// Production fix: reject those keys, use Object.create(null), or use a hardened merge lib.

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key in source) {
    const val = source[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      if (typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

module.exports = { deepMerge };
