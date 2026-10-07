/** Why a file couldn't be analysed; the UI turns each kind into its own message. */
/** `too-slow` is raised by the client when an analysis runs past its time limit. */
export type AnalysisErrorKind = 'not-gpx' | 'malformed' | 'no-points' | 'too-slow';

export class AnalysisError extends Error {
  constructor(
    readonly kind: AnalysisErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}
