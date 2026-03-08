/**
 * Re-export metricsBundle from @opendockit/core to prevent drift.
 *
 * The authoritative source is packages/core/src/font/data/metrics-bundle.ts.
 * This re-export ensures render always uses the same data as core.
 */

// Re-export from authoritative source to prevent drift
export { metricsBundle } from '@opendockit/core/font/data/metrics-bundle';
