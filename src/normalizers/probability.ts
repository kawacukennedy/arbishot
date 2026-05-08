export function decimalToImpliedProb(decimalOdds: number): number {
  if (decimalOdds <= 0) return 0;
  return 1 / decimalOdds;
}

export function americanToDecimal(american: number): number {
  if (american === 0) return 0;
  if (american > 0) return 1 + american / 100;
  return 1 - 100 / american;
}

export function americanToImpliedProb(american: number): number {
  if (american === 0) return 0;
  if (american > 0) return 100 / (american + 100);
  return -american / (-american + 100);
}

export function anyOddsToDecimal(price: number): number {
  if (price >= 0) return 1 + price / 100;
  return 1 - 100 / price;
}

export function deVig(probA: number, probB: number): { probA: number; probB: number } {
  const total = probA + probB;
  if (total <= 0) return { probA: 0, probB: 0 };
  return { probA: probA / total, probB: probB / total };
}

export function probToDecimal(prob: number): number {
  if (prob <= 0) return 0;
  return 1 / prob;
}

export function deVigOdds(decimalA: number, decimalB: number): { probA: number; probB: number } {
  return deVig(decimalToImpliedProb(decimalA), decimalToImpliedProb(decimalB));
}
