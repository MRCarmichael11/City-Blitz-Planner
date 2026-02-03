export const TRANSFER_SCORE_VERSION = "v6";
export const TRANSFER_SCORE_BASE = -3968687;
export const TRANSFER_SCORE_COEFFICIENTS = {
  hero: 30147,
  building: 28982,
  drone: 53445,
};
export const POWER_DIVISOR = 1_000_000;

export type TransferScoreInputs = {
  heroTop15: number;
  building: number;
  drone: number;
};

export type TransferScoreResult = {
  base: number;
  heroContribution: number;
  buildingContribution: number;
  droneContribution: number;
  rawScore: number;
  score: number;
};

export function parsePowerInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return Number.NaN;
  }

  const normalized = trimmed.replace(/[\s,_]+/g, "");
  const suffixMatch = normalized.match(/([kmb])$/i);
  let multiplier = 1;
  let numberPart = normalized;

  if (suffixMatch) {
    const suffix = suffixMatch[1].toLowerCase();
    numberPart = normalized.slice(0, -1);
    if (suffix === "k") {
      multiplier = 1_000;
    } else if (suffix === "m") {
      multiplier = 1_000_000;
    } else if (suffix === "b") {
      multiplier = 1_000_000_000;
    }
  }

  if (!numberPart || numberPart === ".") {
    return Number.NaN;
  }

  const parsed = Number(numberPart);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }

  return Math.round(parsed * multiplier);
}

export function estimateTransferScore(
  inputs: TransferScoreInputs
): TransferScoreResult {
  const H = inputs.heroTop15 / POWER_DIVISOR;
  const B = inputs.building / POWER_DIVISOR;
  const D = inputs.drone / POWER_DIVISOR;

  const heroContribution = TRANSFER_SCORE_COEFFICIENTS.hero * H;
  const buildingContribution = TRANSFER_SCORE_COEFFICIENTS.building * B;
  const droneContribution = TRANSFER_SCORE_COEFFICIENTS.drone * D;
  const rawScore =
    TRANSFER_SCORE_BASE +
    heroContribution +
    buildingContribution +
    droneContribution;

  return {
    base: TRANSFER_SCORE_BASE,
    heroContribution,
    buildingContribution,
    droneContribution,
    rawScore,
    score: Math.max(0, rawScore),
  };
}
