import type { Product } from '../types';

/**
 * Calculates the Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[an][bn];
}

// Common meat & cut synonyms/typo dictionary
const COMMON_TYPO_MAP: Record<string, string> = {
  chikn: 'chicken',
  chiken: 'chicken',
  chickn: 'chicken',
  chkn: 'chicken',
  chick: 'chicken',
  muton: 'mutton',
  mutten: 'mutton',
  moton: 'mutton',
  motton: 'mutton',
  lamp: 'lamb',
  prwn: 'prawn',
  prawns: 'prawn',
  prawnz: 'prawn',
  proms: 'prawn',
  shrimp: 'prawn',
  surmye: 'surmai',
  surmi: 'surmai',
  searfis: 'seer fish',
  kheema: 'keema',
  botti: 'boti',
  bonles: 'boneless',
  curricut: 'curry cut',
  fishh: 'fish'
};

export interface SearchMatchResult {
  products: Product[];
  suggestedTerm: string | null;
  isTypoCorrected: boolean;
}

/**
 * Searches products with live suggestions and typo tolerance
 */
export function searchProductsWithTypoTolerance(
  query: string,
  products: Product[],
  limit: number = 6
): SearchMatchResult {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return { products: [], suggestedTerm: null, isTypoCorrected: false };
  }

  // 1. Check direct typo dictionary substitution
  const mappedTerm = COMMON_TYPO_MAP[cleanQuery] || null;
  const effectiveQuery = mappedTerm || cleanQuery;

  // 2. Exact & Prefix Matches
  const exactMatches: Product[] = [];
  const prefixMatches: Product[] = [];
  const fuzzyMatches: Product[] = [];

  const queryWords = effectiveQuery.split(/\s+/).filter(Boolean);

  for (const product of products) {
    const nameLower = (product.name || '').toLowerCase();
    const catLower = (product.category || '').toLowerCase();
    const cutLower = (product.cutStyle || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();
    const allText = `${nameLower} ${catLower} ${cutLower} ${descLower}`;

    // Exact full query match
    if (allText.includes(effectiveQuery)) {
      if (nameLower.includes(effectiveQuery) || catLower.includes(effectiveQuery)) {
        exactMatches.push(product);
      } else {
        prefixMatches.push(product);
      }
      continue;
    }

    // Word prefix match
    const hasWordPrefix = queryWords.every(qw => 
      allText.split(/\s+/).some(word => word.startsWith(qw))
    );
    if (hasWordPrefix) {
      prefixMatches.push(product);
      continue;
    }

    // Fuzzy typo match: compare query words against product words
    const prodWords = nameLower.split(/\s+/).concat(catLower.split(/\s+/));
    let hasFuzzyMatch = false;

    for (const qw of queryWords) {
      if (qw.length < 3) continue; // Skip tiny query tokens for fuzzy distance
      for (const pw of prodWords) {
        if (pw.length < 3) continue;
        const maxDist = qw.length <= 4 ? 1 : 2;
        if (levenshteinDistance(qw, pw) <= maxDist) {
          hasFuzzyMatch = true;
          break;
        }
      }
      if (hasFuzzyMatch) break;
    }

    if (hasFuzzyMatch) {
      fuzzyMatches.push(product);
    }
  }

  // Combine results by priority
  const combined = Array.from(new Set([...exactMatches, ...prefixMatches, ...fuzzyMatches])).slice(0, limit);

  // Determine if a typo suggestion should be surfaced
  let suggestedTerm: string | null = null;
  if (mappedTerm && mappedTerm !== cleanQuery) {
    suggestedTerm = mappedTerm;
  } else if (exactMatches.length === 0 && fuzzyMatches.length > 0) {
    // Find closest product or category name to recommend
    const candidate = fuzzyMatches[0];
    suggestedTerm = candidate.category || candidate.name;
  }

  return {
    products: combined,
    suggestedTerm,
    isTypoCorrected: Boolean(suggestedTerm && suggestedTerm.toLowerCase() !== cleanQuery)
  };
}
