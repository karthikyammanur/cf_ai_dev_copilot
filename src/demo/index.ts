/**
 * Demo Module Index
 *
 * Exports all demo content for DevCopilot demonstration.
 * Used by the UI to populate "Try Example" buttons and showcase features.
 *
 * @module demo
 */

export {
  SAMPLE_ERRORS,
  getSampleError,
  getSampleErrorsByCategory,
  getSampleErrorOptions
} from "./sample-errors";
export {
  SAMPLE_CODE,
  getSampleCode,
  getSampleCodeOptions
} from "./sample-code";

export type { SampleError } from "./sample-errors";
export type { SampleCode } from "./sample-code";
