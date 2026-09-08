export { check, DEFAULT_CHECK_OPTIONS } from "./check.js";
export { extractClaims, DEFAULT_EXTRACT_OPTIONS } from "./extract.js";
export { collectSource, collectSourceValues } from "./source.js";
export type { Collected } from "./source.js";
export { findEvidence, derivedCandidates } from "./derive.js";
export { matchesClaim, roundToDecimals, roundToSignificant } from "./match.js";

export type {
  ArrayLength,
  Claim,
  ClaimResult,
  ClaimStatus,
  CheckInput,
  CheckOptions,
  Evidence,
  ExtractOptions,
  NearestMiss,
  Report,
  SourceValue,
  Unit,
} from "./types.js";
