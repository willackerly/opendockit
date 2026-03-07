# Branded Types: Compile-Time Unit Safety

## The Problem

PDF coordinates use points (72 per inch). Screen rendering uses pixels (typically 96 per inch at standard DPI). OOXML uses EMU (914,400 per inch). When all of these are typed as plain `number`, the compiler cannot catch unit confusion:

```typescript
// Bug: mixing points and pixels silently compiles
function drawAt(x: number, y: number) { ... }
const xPoints = 72;   // 1 inch in points
const yPixels = 96;   // 1 inch in pixels
drawAt(xPoints, yPixels);  // Wrong! No error.
```

This class of bug is subtle, hard to reproduce, and common in graphics code that converts between coordinate systems.

## The Pattern

TypeScript's structural type system normally treats any `number` as interchangeable. Branded types exploit an escape hatch: intersecting `number` with an object type containing a unique symbol creates a type that is assignable from nothing except itself and explicit casts.

```typescript
declare const POINTS_BRAND: unique symbol;
export type Points = number & { readonly [POINTS_BRAND]: true };
```

Key properties:

- **`declare`** -- the symbol is never emitted to JavaScript. It exists only in the type system.
- **`unique symbol`** -- no two `unique symbol` declarations are compatible, even if they have the same name.
- **`number &`** -- the branded type extends `number`, so all arithmetic and `Math` operations work.
- **Zero runtime cost** -- after compilation, branded values are plain numbers. No wrapper objects, no overhead.

Factory functions are the only way to create branded values:

```typescript
export const points = (n: number): Points => n as Points;
```

The `as` cast is the "airlock" where unbranded numbers enter the branded world. Once branded, the type system prevents mixing.

## Usage in pdfbox-ts

**File:** `src/units/branded.ts`

| Type | Unit | Domain |
| --- | --- | --- |
| `Points` | 1/72 inch | PDF page coordinates, font sizes, line widths |
| `Pixels` | Device pixels | Screen rendering output |

Factory functions: `points(n)`, `pixels(n)`

Validation at system boundaries:

```typescript
// Type guard -- narrows number to Points
isValidPoints(n: number): n is Points  // true if finite

// Checked factory -- throws on NaN/Infinity
pointsChecked(n: number): Points
```

## Usage in OpenDocKit

**File:** `packages/core/src/units/branded.ts`

| Type | Unit | Domain |
| --- | --- | --- |
| `EMU` | English Metric Units (1/914400 inch) | All OOXML spatial values |
| `HundredthsPt` | 1/100 typographic point | Font sizes, character spacing |
| `Pixels` | Device pixels | Canvas rendering output |

Factory functions: `emu(n)`, `hundredthsPt(n)`, `pixels(n)`

EMU validation is stricter -- it also requires integers (`Number.isInteger`), since OOXML EMU values are always whole numbers.

## Why Not Enum or Class Wrappers?

| Approach | Runtime cost | Arithmetic | Type safety |
| --- | --- | --- | --- |
| Plain `number` | None | Native | None |
| Branded `number` | None | Native | Full |
| Class wrapper | Allocation + GC | Method calls | Full |
| Enum | None | Awkward | Partial |

Branded types are the sweet spot: full compile-time safety with zero runtime overhead. Class wrappers would require unwrapping for every arithmetic operation and create garbage-collection pressure in hot paths. Enums cannot represent continuous numeric ranges.

## How TypeScript Enforces Safety

```typescript
const p: Points = points(72);
const px: Pixels = pixels(96);

// Compile error: Type 'Points' is not assignable to type 'Pixels'
const bad: Pixels = p;

// Compile error: Type 'number' is not assignable to type 'Points'
const also_bad: Points = 42;

// OK: arithmetic yields plain number, must re-brand
const sum: number = p + points(36);
const result: Points = points(sum);

// OK: branded values work with all number operations
Math.abs(p);
Math.round(p);
p > px;  // comparison works (both extend number)
```

Note that arithmetic on two branded values yields `number`, not the branded type. This is intentional -- the compiler forces you to explicitly brand the result, which is a natural checkpoint to verify the unit is correct.

## Migration Strategy

Branded types are designed for **gradual adoption**:

1. **Add the types.** No existing code breaks because branded types are not required anywhere yet.
2. **Adopt at boundaries.** Start using branded types in new APIs and at conversion points (e.g., `pointsToPixels(p: Points, dpi: number): Pixels`).
3. **Spread inward.** As callers of those APIs update, type safety propagates through the codebase.
4. **Existing `number` code keeps working.** A function accepting `number` can receive a `Points` value (branded extends number). Only functions specifically typed to accept `Points` will reject plain `number`.

This means adoption is fully backward-compatible and can happen incrementally over time.
