/**
 * Shape Guide Formula Evaluator.
 *
 * Evaluates OOXML shape guide formulas used in DrawingML geometry definitions.
 * This is the core math engine that converts formula expressions like
 * "star-slash w adj1 100000" into numeric values.
 *
 * Port of Apache POI's GuideIf.evaluateGuide(), Context, and BuiltInGuide.
 *
 * Reference: ECMA-376 5th Edition, Part 1, 20.1.9 (Shape Definitions and Guides)
 */

const OOXML_DEGREE = 60000;

/**
 * Evaluation context for shape guide formulas.
 * Contains built-in variables and evaluated guide values.
 */
export interface GuideContext {
  /** Get the value of a variable (built-in or guide result). */
  get(name: string): number;
  /** Check if a variable exists. */
  has(name: string): boolean;
}

/** Number pattern for detecting literal numeric values in formula arguments. */
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Mutable guide context implementation.
 * Stores built-in variables and evaluated guide results.
 */
class MutableGuideContext implements GuideContext {
  private readonly vars = new Map<string, number>();

  set(name: string, value: number): void {
    this.vars.set(name, value);
  }

  get(name: string): number {
    const v = this.vars.get(name);
    if (v !== undefined) return v;
    // Check if it's a numeric literal
    if (NUMBER_PATTERN.test(name)) {
      return parseFloat(name);
    }
    return 0;
  }

  has(name: string): boolean {
    return this.vars.has(name) || NUMBER_PATTERN.test(name);
  }
}

/**
 * Populate built-in variables for a given shape size.
 *
 * These match Apache POI's BuiltInGuide enum exactly.
 * In POI, l/t/r/b use the anchor's absolute coordinates, but for our
 * use case (rendering in a local coordinate space), we set l=0, t=0,
 * r=width, b=height.
 */
function populateBuiltIns(ctx: MutableGuideContext, width: number, height: number): void {
  const w = width;
  const h = height;
  const ss = Math.min(w, h);
  const ls = Math.max(w, h);

  // Shape dimensions
  ctx.set('w', w);
  ctx.set('h', h);

  // Width divisions
  ctx.set('wd2', w / 2);
  ctx.set('wd3', w / 3);
  ctx.set('wd4', w / 4);
  ctx.set('wd5', w / 5);
  ctx.set('wd6', w / 6);
  ctx.set('wd8', w / 8);
  ctx.set('wd10', w / 10);
  ctx.set('wd12', w / 12);
  ctx.set('wd32', w / 32);

  // Height divisions
  ctx.set('hd2', h / 2);
  ctx.set('hd3', h / 3);
  ctx.set('hd4', h / 4);
  ctx.set('hd5', h / 5);
  ctx.set('hd6', h / 6);
  ctx.set('hd8', h / 8);

  // Bounds (local coordinate space: origin at 0,0)
  ctx.set('l', 0);
  ctx.set('t', 0);
  ctx.set('r', w);
  ctx.set('b', h);

  // Centers
  ctx.set('hc', w / 2);
  ctx.set('vc', h / 2);

  // Short side / Long side
  ctx.set('ss', ss);
  ctx.set('ls', ls);
  ctx.set('ssd2', ss / 2);
  ctx.set('ssd4', ss / 4);
  ctx.set('ssd6', ss / 6);
  ctx.set('ssd8', ss / 8);
  ctx.set('ssd16', ss / 16);
  ctx.set('ssd32', ss / 32);

  // Angle constants (in 60,000ths of a degree)
  ctx.set('cd2', 180 * OOXML_DEGREE); // 10800000
  ctx.set('cd4', 90 * OOXML_DEGREE); // 5400000
  ctx.set('cd8', 45 * OOXML_DEGREE); // 2700000
  ctx.set('3cd4', 270 * OOXML_DEGREE); // 16200000
  ctx.set('3cd8', 135 * OOXML_DEGREE); // 8100000
  ctx.set('5cd8', 225 * OOXML_DEGREE); // 13500000
  ctx.set('7cd8', 315 * OOXML_DEGREE); // 18900000
}

/**
 * Convert OOXML angle (60,000ths of a degree) to radians.
 */
function toRadians(ooxmlAngle: number): number {
  return ((ooxmlAngle / OOXML_DEGREE) * Math.PI) / 180;
}

/**
 * Convert radians to OOXML angle (60,000ths of a degree).
 */
function toDegrees60k(radians: number): number {
  return ((radians * 180) / Math.PI) * OOXML_DEGREE;
}

/**
 * Resolve a formula argument to a numeric value.
 * If the argument is a numeric literal, parse it directly.
 * Otherwise, look it up in the context.
 */
function resolveArg(arg: string | undefined, ctx: GuideContext): number {
  if (arg === undefined) return 0;
  if (NUMBER_PATTERN.test(arg)) {
    return parseFloat(arg);
  }
  return ctx.get(arg);
}

/**
 * Guard a numeric result against NaN and Infinity.
 * Returns 0 for invalid values.
 */
function guard(value: number): number {
  if (!isFinite(value) || isNaN(value)) return 0;
  return value;
}

/**
 * Evaluate a single formula expression.
 *
 * Formula format: 'operator arg1 [arg2] [arg3]'
 *
 * This is a faithful port of Apache POI's GuideIf.evaluateGuide().
 *
 * @param formula The formula string (e.g., '*\/ w 1 2' or '+- hd2 0 0')
 * @param ctx The evaluation context
 * @returns The computed numeric value
 */
export function evaluateFormula(formula: string, ctx: GuideContext): number {
  const parts = formula.trim().split(/\s+/);
  const op = parts[0];
  const x = resolveArg(parts[1], ctx);
  const y = resolveArg(parts[2], ctx);
  const z = resolveArg(parts[3], ctx);

  switch (op) {
    case 'val':
      // Literal value
      return x;

    case '*/':
      // Multiply-Divide: x * y / z
      return guard(z === 0 ? 0 : (x * y) / z);

    case '+-':
      // Add-Subtract: x + y - z
      return guard(x + y - z);

    case '+/':
      // Add-Divide: (x + y) / z
      return guard(z === 0 ? 0 : (x + y) / z);

    case '?:':
      // Conditional: if x > 0 then y else z
      return x > 0 ? y : z;

    case 'abs':
      // Absolute value
      return Math.abs(x);

    case 'at2':
      // ArcTan2: atan2(y, x) in 60000ths of degree
      // Note: POI passes (y, x) to Math.atan2, matching atan2(y, x) convention
      return guard(toDegrees60k(Math.atan2(y, x)));

    case 'cat2':
      // Cosine ArcTan: x * cos(atan2(z, y))
      return guard(x * Math.cos(Math.atan2(z, y)));

    case 'cos':
      // Cosine: x * cos(y) where y is in 60kths of degree
      return guard(x * Math.cos(toRadians(y)));

    case 'max':
      // Maximum
      return Math.max(x, y);

    case 'min':
      // Minimum
      return Math.min(x, y);

    case 'mod':
      // Modulus (vector magnitude): sqrt(x^2 + y^2 + z^2)
      return guard(Math.sqrt(x * x + y * y + z * z));

    case 'pin':
      // Pin (clamp): if y < x then x, if y > z then z, else y
      // POI: max(x, min(y, z))
      return Math.max(x, Math.min(y, z));

    case 'sat2':
      // Sine ArcTan: x * sin(atan2(z, y))
      return guard(x * Math.sin(Math.atan2(z, y)));

    case 'sin':
      // Sine: x * sin(y) where y is in 60kths of degree
      return guard(x * Math.sin(toRadians(y)));

    case 'sqrt':
      // Square root
      return guard(Math.sqrt(x));

    case 'tan':
      // Tangent: x * tan(y) where y is in 60kths of degree
      return guard(x * Math.tan(toRadians(y)));

    default:
      return 0;
  }
}

/**
 * Create a guide context with built-in variables for a given shape size.
 *
 * @param width Shape width in EMU (or any unit - the evaluator is unit-agnostic)
 * @param height Shape height in EMU
 * @param adjustValues Adjustment handle values (override defaults from avLst)
 * @returns A GuideContext populated with built-in variables and any adjust overrides
 */
export function createGuideContext(
  width: number,
  height: number,
  adjustValues?: Record<string, number>
): GuideContext {
  const ctx = new MutableGuideContext();
  populateBuiltIns(ctx, width, height);

  // Apply adjust value overrides
  if (adjustValues) {
    for (const [name, value] of Object.entries(adjustValues)) {
      ctx.set(name, value);
    }
  }

  return ctx;
}

/**
 * Evaluate a list of shape guides (formulas) in order.
 *
 * Each guide can reference previous guides and built-in variables.
 * Guides are evaluated sequentially — guide B can reference guide A
 * if A appears before B in the list.
 *
 * @param guides Array of { name, fmla } pairs (matching OOXML schema naming)
 * @param ctx The evaluation context (will be modified in-place)
 * @returns The same context, now containing all evaluated guide values
 */
export function evaluateGuides(
  guides: Array<{ name: string; fmla: string }>,
  ctx: GuideContext
): GuideContext {
  // We need a mutable context to store results.
  // If the provided ctx is already a MutableGuideContext, use it directly.
  // Otherwise, create a wrapper that delegates reads to the original
  // and stores new values.
  const mctx = ctx as MutableGuideContext;
  if (typeof mctx.set !== 'function') {
    // Shouldn't happen with createGuideContext, but handle gracefully
    const wrapper = new MutableGuideContext();
    for (const guide of guides) {
      const value = evaluateFormula(guide.fmla, ctx);
      wrapper.set(guide.name, value);
    }
    return wrapper;
  }

  for (const guide of guides) {
    const value = evaluateFormula(guide.fmla, mctx);
    mctx.set(guide.name, value);
  }

  return mctx;
}
