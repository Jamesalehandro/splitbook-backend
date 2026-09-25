/**
 * The bridge between business rules and HTTP.
 *
 * A service throws `ApiError.notFound(...)` without knowing anything about
 * Express; the error handler middleware is what turns it into a 404 response.
 */

/** One entry of the `errors` array a validation failure carries. */
export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorParams {
  statusCode: number;
  message: string;
  errors?: FieldError[];
}

/** For the factories that can carry field-level detail alongside the message. */
export interface ApiErrorDetailParams {
  message: string;
  errors?: FieldError[];
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errors?: FieldError[];

  /** Distinguishes "expected" errors from genuine bugs when logging. */
  readonly isOperational = true;

  constructor({ statusCode, message, errors }: ApiErrorParams) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest({ message, errors }: ApiErrorDetailParams): ApiError {
    return new ApiError({ statusCode: 400, message, errors });
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError({ statusCode: 401, message });
  }

  static forbidden(message = 'You do not have permission to do that'): ApiError {
    return new ApiError({ statusCode: 403, message });
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError({ statusCode: 404, message });
  }

  /**
   * The request is valid but clashes with the current state — an email already
   * registered, a user already in the group, a member who still owes money.
   */
  static conflict(message: string): ApiError {
    return new ApiError({ statusCode: 409, message });
  }

  static tooManyRequests(message = 'Too many requests, please slow down'): ApiError {
    return new ApiError({ statusCode: 429, message });
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError({ statusCode: 500, message });
  }
}
