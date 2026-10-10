const DEFAULT_PREFERRED_COMPARISON_ID = '2019-notional-2024';

function hasBoundarySetId(election) {
  return typeof election?.boundarySetId === 'string' && election.boundarySetId.trim().length > 0;
}

/** Seat-by-seat comparisons require an explicitly matching boundary set. */
export function isBoundaryCompatible(current, candidate) {
  return hasBoundarySetId(current)
    && hasBoundarySetId(candidate)
    && current.boundarySetId === candidate.boundarySetId;
}

/**
 * Return picker choices annotated with their boundary compatibility. The
 * current election is never offered as its own comparison.
 */
export function filterComparisonChoices(elections, current, compatibleOnly = false) {
  if (!Array.isArray(elections)) return [];

  return elections
    .filter((item) => item?.id && item.id !== current?.id)
    .map((item) => {
      const boundaryCompatible = isBoundaryCompatible(current, item);
      return {
        ...item,
        boundaryCompatible,
        compatibilityLabel: boundaryCompatible
          ? 'Same boundaries'
          : 'Different boundaries · seat changes unavailable',
      };
    })
    .filter((item) => !compatibleOnly || item.boundaryCompatible);
}

/**
 * Keep the selected comparison while it remains visible. If a current-election
 * change or compatible-only filter removes it, prefer the established notional
 * 2024 baseline when available, then the first remaining option. Return an
 * empty string when there are no comparisons to select.
 */
export function resolveComparisonChoice(elections, current, selectedId, compatibleOnly = false,
  preferredId = DEFAULT_PREFERRED_COMPARISON_ID) {
  const options = filterComparisonChoices(elections, current, compatibleOnly);
  if (options.some((item) => item.id === selectedId)) return selectedId;

  const preferred = options.find((item) => item.id === preferredId && item.boundaryCompatible);
  if (preferred) return preferred.id;

  const newestCompatible = options
    .filter((item) => item.boundaryCompatible)
    .map((item, index) => ({ item, index, year: Number(item.year) }))
    .sort((a, b) => {
      const aYear = Number.isFinite(a.year) ? a.year : Number.NEGATIVE_INFINITY;
      const bYear = Number.isFinite(b.year) ? b.year : Number.NEGATIVE_INFINITY;
      return bYear - aYear || a.index - b.index;
    })[0]?.item;
  if (newestCompatible) return newestCompatible.id;

  return compatibleOnly ? '' : options[0]?.id || '';
}
