export interface UnsupportedFeatureContext {
  [key: string]: unknown;
}

export interface UnsupportedFeaturePayload {
  feature: string;
  message: string;
  recommendation: string;
  context?: UnsupportedFeatureContext;
}

export class UnsupportedPdfFeatureError extends Error {
  readonly feature: string;
  readonly recommendation: string;
  readonly context?: UnsupportedFeatureContext;

  constructor(payload: UnsupportedFeaturePayload) {
    const body = `[Unsupported PDF feature: ${payload.feature}] ${payload.message}`;
    super(`${body} — ${payload.recommendation}`);
    this.name = 'UnsupportedPdfFeatureError';
    this.feature = payload.feature;
    this.recommendation = payload.recommendation;
    this.context = payload.context;
  }
}
