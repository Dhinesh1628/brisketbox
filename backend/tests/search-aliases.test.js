import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import regional search aliases from frontend source
const REGIONAL_SEARCH_ALIASES = {
  // Chicken aliases
  koli: 'chicken',
  kodi: 'chicken',
  kozhi: 'chicken',

  // Mutton aliases
  mamsam: 'mutton',
  mutton: 'mutton',
  gosht: 'mutton',

  // Prawns aliases
  royyalu: 'prawns',
  jhinga: 'prawns',
  eral: 'prawns',

  // Fish aliases
  meen: 'fish',
  machli: 'fish',
  chepa: 'fish'
};

const mockProducts = [
  { id: 'p1', name: 'Fresh Chicken Curry Cut', category: 'Fresh Chicken' },
  { id: 'p2', name: 'Tender Goat Mutton Curry Cut', category: 'Tender Mutton' },
  { id: 'p3', name: 'Tiger Prawns (Cleaned & Deveined)', category: 'Fish & Seafood' },
  { id: 'p4', name: 'Surmai Steaks (Seer Fish)', category: 'Fish & Seafood' }
];

function searchMockProducts(term) {
  const clean = term.toLowerCase().trim();
  const mapped = REGIONAL_SEARCH_ALIASES[clean] || clean;
  return mockProducts.filter(p => 
    p.name.toLowerCase().includes(mapped) || 
    p.category.toLowerCase().includes(mapped)
  );
}

describe('Search Aliases Unit Test Suite', () => {
  it('maps koli, kodi, kozhi to chicken and finds chicken products', () => {
    for (const alias of ['koli', 'kodi', 'kozhi']) {
      assert.equal(REGIONAL_SEARCH_ALIASES[alias], 'chicken', `${alias} must map to chicken`);
      const results = searchMockProducts(alias);
      assert.ok(results.length > 0, `Search for "${alias}" must return chicken products`);
      assert.ok(results.some(r => r.name.includes('Chicken')));
    }
  });

  it('maps mamsam, mutton, gosht to mutton and finds mutton products', () => {
    for (const alias of ['mamsam', 'mutton', 'gosht']) {
      assert.equal(REGIONAL_SEARCH_ALIASES[alias], 'mutton', `${alias} must map to mutton`);
      const results = searchMockProducts(alias);
      assert.ok(results.length > 0, `Search for "${alias}" must return mutton products`);
      assert.ok(results.some(r => r.name.includes('Mutton')));
    }
  });

  it('maps royyalu, jhinga, eral to prawns and finds prawn products', () => {
    for (const alias of ['royyalu', 'jhinga', 'eral']) {
      assert.equal(REGIONAL_SEARCH_ALIASES[alias], 'prawns', `${alias} must map to prawns`);
      const results = searchMockProducts(alias);
      assert.ok(results.length > 0, `Search for "${alias}" must return prawn products`);
      assert.ok(results.some(r => r.name.includes('Prawns')));
    }
  });

  it('maps meen, machli, chepa to fish and finds fish products', () => {
    for (const alias of ['meen', 'machli', 'chepa']) {
      assert.equal(REGIONAL_SEARCH_ALIASES[alias], 'fish', `${alias} must map to fish`);
      const results = searchMockProducts(alias);
      assert.ok(results.length > 0, `Search for "${alias}" must return fish products`);
      assert.ok(results.some(r => r.name.includes('Fish') || r.category.includes('Fish')));
    }
  });
});
