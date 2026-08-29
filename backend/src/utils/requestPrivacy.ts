/**
 * Redacts opaque recovery tokens that may appear in a request path.
 * Query strings are intentionally not accepted here: callers should use
 * req.path (without the query) when producing diagnostics or access logs.
 */
export const sanitizeRequestPath = (requestPath: string): string =>
  requestPath.replace(/(verify-reset-token\/)[^/?#]+/g, '$1[REDACTED]');
