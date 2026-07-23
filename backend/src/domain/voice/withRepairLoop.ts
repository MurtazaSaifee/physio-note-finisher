import { z } from "zod";

export class AiRepairLoopExhaustedError extends Error {
  constructor(
    public readonly stageName: string,
    public readonly attempts: number,
    public readonly reason: string = "invalid_llm_output",
  ) {
    super(`${stageName}_failed:${reason} after ${attempts} repair attempts`);
  }
}

export interface RepairLoopOptions {
  /**
   * Optional repair function called when initial generation produces invalid output.
   * Receives the raw output and the validation error, returns a repaired version.
   * If not provided, the loop simply retries generation without repair.
   */
  repairFn?: (raw: unknown, validationError: z.ZodError) => Promise<unknown>;
}

/**
 * Run a generation function with Zod validation and optional repair loop.
 *
 * D-12 sequence:
 *   1. Call generateFn → validate with schema
 *      → Success? Return.
 *   2. Failure? Call repairFn(raw, error) if provided → validate again
 *      → Success? Return.
 *   3. Still failure? Call generateFn again (fresh retry) → validate
 *      → Success? Return.
 *   4. Still failure? Throw AiRepairLoopExhaustedError with reason "invalid_llm_output".
 *
 * If no repairFn is provided, the function falls back to simple retry
 * (call generateFn up to maxAttempts times).
 */
export async function runWithRepairLoop<T>(
  generateFn: () => Promise<unknown>,
  schema: z.ZodType<T>,
  stageName: string,
  maxAttempts?: number,
): Promise<T>;
export async function runWithRepairLoop<T>(
  generateFn: () => Promise<unknown>,
  schema: z.ZodType<T>,
  stageName: string,
  opts: RepairLoopOptions,
): Promise<T>;
export async function runWithRepairLoop<T>(
  generateFn: () => Promise<unknown>,
  schema: z.ZodType<T>,
  stageName: string,
  maxAttemptsOrOpts?: number | RepairLoopOptions,
): Promise<T> {
  const opts: RepairLoopOptions =
    typeof maxAttemptsOrOpts === "number"
      ? {}
      : (maxAttemptsOrOpts ?? {});
  const maxAttempts = typeof maxAttemptsOrOpts === "number" ? maxAttemptsOrOpts : 3;

  let attemptCount = 0;

  // Attempt 1: Initial generation
  attemptCount++;
  const raw1 = await generateFn();
  const parsed1 = schema.safeParse(raw1);
  if (parsed1.success) {
    return parsed1.data;
  }

  // Attempt: Repair (if repairFn provided)
  if (opts.repairFn) {
    const repairErr = parsed1.error;
    const repaired = await opts.repairFn(raw1, repairErr);
    attemptCount++;
    const parsedRepaired = schema.safeParse(repaired);
    if (parsedRepaired.success) {
      return parsedRepaired.data;
    }
  }

  // Attempt 2: Fresh retry (one more generate)
  attemptCount++;
  const raw2 = await generateFn();
  const parsed2 = schema.safeParse(raw2);
  if (parsed2.success) {
    return parsed2.data;
  }

  // If repairFn is provided and we got here, attempt repair on second output too
  if (opts.repairFn && attemptCount < maxAttempts) {
    const repairErr2 = parsed2.error;
    const repaired2 = await opts.repairFn(raw2, repairErr2);
    attemptCount++;
    const parsedRepaired2 = schema.safeParse(repaired2);
    if (parsedRepaired2.success) {
      return parsedRepaired2.data;
    }
  }

  // Fallback: legacy behavior — retry up to maxAttempts
  for (let i = attemptCount; i < maxAttempts; i++) {
    attemptCount++;
    const raw = await generateFn();
    const parsed = schema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
  }

  throw new AiRepairLoopExhaustedError(stageName, attemptCount, "invalid_llm_output");
}
