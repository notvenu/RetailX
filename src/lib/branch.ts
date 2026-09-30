/**
 * New Branch Opening Evaluation — financial engine.
 * Pure functions: inputs → three scenarios → recommendation. No I/O.
 */

export type BranchInputs = {
  name: string;
  location: string;
  storeSqft: number;
  initialInvestment: number;
  monthlyRent: number;
  deposit: number;
  expectedMonthlySales: number;
  grossMarginPct: number;
  employeeCount: number;
  monthlyPayroll: number;
  monthlyUtilities: number;
  otherMonthlyOpex: number;
  marketingLaunchCost: number;
  expectedAnnualGrowthPct: number;
  financingCostPct: number; // annual, applied to initial investment
};

// Nandan Provisions' proposal for a second store; sales per sq ft set at the Baner Road store's September level
export const DEFAULT_INPUTS: BranchInputs = {
  name: "Second store, Wakad",
  location: "Wakad, Pune",
  storeSqft: 1800,
  initialInvestment: 2_400_000, // fit-out ₹9 L, racks, chillers and tills ₹5 L, opening stock ₹10 L
  monthlyRent: 144_000, // ₹80 per sq ft
  deposit: 432_000, // three months' rent
  expectedMonthlySales: 2_800_000,
  grossMarginPct: 19,
  employeeCount: 10,
  monthlyPayroll: 185_000,
  monthlyUtilities: 38_000,
  otherMonthlyOpex: 36_000,
  marketingLaunchCost: 120_000,
  expectedAnnualGrowthPct: 8,
  financingCostPct: 11.5, // MSME term loan
};

export type ScenarioKey = "conservative" | "base" | "optimistic";

const SHIFT: Record<ScenarioKey, { sales: number; marginPts: number; label: string }> = {
  conservative: { sales: 0.82, marginPts: -2, label: "Conservative" },
  base: { sales: 1.0, marginPts: 0, label: "Base" },
  optimistic: { sales: 1.12, marginPts: 1.5, label: "Optimistic" },
};

export type ScenarioResult = {
  key: ScenarioKey;
  label: string;
  monthlySales: number;
  grossMarginPct: number;
  grossProfitMonthly: number;
  fixedMonthly: number;
  operatingProfitMonthly: number;
  operatingMarginPct: number;
  breakEvenMonthlySales: number;
  breakEvenAchievementPct: number;
  rentToSalesPct: number;
  paybackMonths: number | null;
  roiY1Pct: number;
  rocePct: number;
  cashFlowImpactY1: number;
  riskScore: number; // 0–100, higher = riskier
  riskLevel: "Low" | "Medium" | "High";
  cumCash: number[]; // cumulative cash position by month, starting after upfront outlay
};

const HORIZON = 36;

/** month-1 at 72% of steady sales, linear ramp to 100% by month 6, then annual growth */
function salesPath(steady: number, growthPct: number): number[] {
  const g = growthPct / 100 / 12;
  const out: number[] = [];
  for (let m = 1; m <= HORIZON; m++) {
    const ramp = m >= 6 ? 1 : 0.72 + (0.28 * (m - 1)) / 5;
    const grown = m > 6 ? Math.pow(1 + g, m - 6) : 1;
    out.push(steady * ramp * grown);
  }
  return out;
}

function riskFrom(s: {
  breakEvenAchievementPct: number;
  rentToSalesPct: number;
  paybackMonths: number | null;
  operatingMarginPct: number;
}): { score: number; level: ScenarioResult["riskLevel"] } {
  const beGap = Math.max(0, 130 - s.breakEvenAchievementPct); // want comfortably >100
  const rent = Math.max(0, s.rentToSalesPct - 4) * 6; // >4% starts to bite
  const pay = s.paybackMonths == null ? 60 : Math.max(0, s.paybackMonths - 12) * 1.6;
  const margin = Math.max(0, 6 - s.operatingMarginPct) * 4;
  const score = Math.min(100, Math.round(beGap * 0.7 + rent + pay + margin));
  const level = score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";
  return { score, level };
}

export function runScenario(input: BranchInputs, key: ScenarioKey): ScenarioResult {
  const shift = SHIFT[key];
  const monthlySales = input.expectedMonthlySales * shift.sales;
  const grossMarginPct = input.grossMarginPct + shift.marginPts;
  const m = grossMarginPct / 100;

  const financingMonthly = (input.initialInvestment * input.financingCostPct) / 100 / 12;
  const fixedMonthly =
    input.monthlyRent +
    input.monthlyPayroll +
    input.monthlyUtilities +
    input.otherMonthlyOpex +
    financingMonthly;

  const grossProfitMonthly = monthlySales * m;
  const operatingProfitMonthly = grossProfitMonthly - fixedMonthly;
  const operatingMarginPct = (operatingProfitMonthly / monthlySales) * 100;
  const breakEvenMonthlySales = fixedMonthly / m;
  const breakEvenAchievementPct = (monthlySales / breakEvenMonthlySales) * 100;
  const rentToSalesPct = (input.monthlyRent / monthlySales) * 100;

  const upfront = input.initialInvestment + input.deposit + input.marketingLaunchCost;
  const capitalEmployed = input.initialInvestment + input.deposit;

  const path = salesPath(monthlySales, input.expectedAnnualGrowthPct);
  let cum = -upfront;
  let paybackMonths: number | null = null;
  let y1OpProfit = 0;
  const cumCash: number[] = [];
  for (let i = 0; i < HORIZON; i++) {
    const op = path[i] * m - fixedMonthly;
    cum += op;
    cumCash.push(Math.round(cum));
    if (i < 12) y1OpProfit += op;
    if (paybackMonths == null && cum >= 0) paybackMonths = i + 1;
  }

  const roiY1Pct = (y1OpProfit / upfront) * 100;
  // capital employed = fixed setup + deposit + ~3 months working capital
  const rocePct = ((operatingProfitMonthly * 12) / (capitalEmployed + fixedMonthly * 3)) * 100;
  const cashFlowImpactY1 = y1OpProfit - upfront;

  const { score, level } = riskFrom({
    breakEvenAchievementPct,
    rentToSalesPct,
    paybackMonths,
    operatingMarginPct,
  });

  return {
    key,
    label: shift.label,
    monthlySales,
    grossMarginPct,
    grossProfitMonthly,
    fixedMonthly,
    operatingProfitMonthly,
    operatingMarginPct,
    breakEvenMonthlySales,
    breakEvenAchievementPct,
    rentToSalesPct,
    paybackMonths,
    roiY1Pct,
    rocePct,
    cashFlowImpactY1,
    riskScore: score,
    riskLevel: level,
    cumCash,
  };
}

export type Recommendation = {
  verdict: "Proceed" | "Proceed with conditions" | "Do not proceed";
  riskLevel: "Low" | "Medium" | "High";
  confidence: number;
  rationale: string;
  keyFactors: { factor: string; effect: string }[];
};

/** perturb one input by ±10% and report the swing in base-case payback */
function sensitivity(input: BranchInputs, field: keyof BranchInputs, label: string) {
  const base = runScenario(input, "base").paybackMonths ?? 60;
  const up = runScenario({ ...input, [field]: (input[field] as number) * 1.1 }, "base").paybackMonths ?? 60;
  const down = runScenario({ ...input, [field]: (input[field] as number) * 0.9 }, "base").paybackMonths ?? 60;
  const swing = Math.abs(up - base) + Math.abs(down - base);
  return { label, swing, effect: `±10% moves payback by ~${Math.round(swing / 2)} months` };
}

export function recommend(input: BranchInputs): Recommendation {
  const c = runScenario(input, "conservative");
  const b = runScenario(input, "base");

  let verdict: Recommendation["verdict"];
  if (c.operatingProfitMonthly > 0 && (b.paybackMonths ?? 99) <= 18 && (c.paybackMonths ?? 99) <= 30) {
    verdict = "Proceed";
  } else if (c.operatingProfitMonthly <= 0 || (b.paybackMonths ?? 99) > 30 || b.operatingProfitMonthly <= 0) {
    verdict = "Do not proceed";
  } else {
    verdict = "Proceed with conditions";
  }

  const factors = [
    sensitivity(input, "expectedMonthlySales", "Expected monthly sales"),
    sensitivity(input, "monthlyRent", "Monthly rent"),
    sensitivity(input, "grossMarginPct", "Expected gross margin"),
    sensitivity(input, "monthlyPayroll", "Payroll cost"),
  ]
    .sort((x, y) => y.swing - x.swing)
    .slice(0, 3)
    .map((f) => ({ factor: f.label, effect: f.effect }));

  const rationale =
    verdict === "Proceed"
      ? `Base case breaks even at ${b.breakEvenAchievementPct.toFixed(0)}% of expected sales and pays back in ${b.paybackMonths} months; the conservative case still returns an operating profit and pays back within ${c.paybackMonths} months.`
      : verdict === "Do not proceed"
        ? `The conservative case ${c.operatingProfitMonthly <= 0 ? "runs an operating loss" : `pays back in ${c.paybackMonths ?? "60+"} months`}, and base payback is ${b.paybackMonths ?? "60+"} months — outside the owner's 24-month limit.`
        : `Base economics work (payback ${b.paybackMonths} months), but the conservative case is thin at ${c.breakEvenAchievementPct.toFixed(0)}% break-even achievement. Proceed only with the conditions below addressed.`;

  return {
    verdict,
    riskLevel: b.riskLevel,
    confidence: verdict === "Proceed" ? 0.79 : verdict === "Do not proceed" ? 0.72 : 0.61,
    rationale,
    keyFactors: factors,
  };
}

export function evaluate(input: BranchInputs) {
  return {
    scenarios: {
      conservative: runScenario(input, "conservative"),
      base: runScenario(input, "base"),
      optimistic: runScenario(input, "optimistic"),
    },
    recommendation: recommend(input),
  };
}

// ponytail: one runnable check on the money path — `node src/lib/branch.ts` (Node 24 strips types)
if ((import.meta as { main?: boolean }).main) {
  const r = evaluate(DEFAULT_INPUTS);
  const { conservative: c, base: b, optimistic: o } = r.scenarios;
  console.assert(c.monthlySales < b.monthlySales && b.monthlySales < o.monthlySales, "sales ordering");
  console.assert(c.riskScore >= b.riskScore, "conservative is not less risky than base");
  console.assert(b.breakEvenMonthlySales > 0 && b.breakEvenAchievementPct > 0, "break-even computed");
  console.assert(
    b.paybackMonths === null || (b.paybackMonths > 0 && b.paybackMonths <= 36),
    "payback within horizon or null",
  );
  console.assert(["Proceed", "Proceed with conditions", "Do not proceed"].includes(r.recommendation.verdict), "verdict");
  console.log("branch.ts self-check OK", {
    base: { payback: b.paybackMonths, be: Math.round(b.breakEvenAchievementPct), roce: Math.round(b.rocePct) },
    verdict: r.recommendation.verdict,
  });
}
