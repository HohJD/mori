// Only deliberate, public messages belong in ApiError. Never wrap an upstream
// message, response body, credential, or exception in one.
export class ApiError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export const invalidRequest = (message, status = 400) =>
  new ApiError(status, 'INVALID_REQUEST', message);

export const cancelledRequest = () =>
  new ApiError(499, 'REQUEST_CANCELLED', 'The request was cancelled.');

export function publicError(error) {
  if (error instanceof ApiError) return error;
  return new ApiError(500, 'INTERNAL_ERROR', 'MORI could not handle this request.');
}
