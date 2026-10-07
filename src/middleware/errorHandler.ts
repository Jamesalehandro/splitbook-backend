import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';

import { isProduction } from '../config';
import { ApiError, type FieldError } from '../utils/error';

/** Mongo's duplicate-key error carries `code: 11000`. */
interface ErrorWithCode {
  code: unknown;
}

/** The `status`/`type` pair an `http-errors` object may carry, before checking. */
interface UnknownHttpErrorFields {
  status: unknown;
  type?: unknown;
}

/** The same pair once narrowed to a client error. */
interface ClientHttpError {
  status: number;
  type?: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as ErrorWithCode).code === 11000
  );
}

function asClientHttpError(error: unknown): ClientHttpError | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  const { status, type } = error as UnknownHttpErrorFields;
  if (typeof status !== 'number' || status < 400 || status >= 500) {
    return null;
  }

  return { status, type: typeof type === 'string' ? type : undefined };
}

/** Nothing matched — hand a 404 to the error handler below. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  let statusCode = 500;
  let message = 'Something went wrong on our side. Please try again.';
  let errors: FieldError[] | undefined;

  const clientHttpError = asClientHttpError(error);

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    errors = error.errors;
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(error.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  } else if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for '${error.path}'`;
  } else if (isDuplicateKeyError(error)) {
    statusCode = 409;
    message = 'That record already exists';
  } else if (clientHttpError) {
    statusCode = clientHttpError.status;
    message =
      clientHttpError.type === 'entity.too.large'
        ? 'Request body too large'
        : 'Malformed request body';
  } else if (error instanceof Error && !isProduction) {
    // Never leak internal messages to clients in production.
    message = error.message;
  }

  if (statusCode >= 500) {
    console.error('[error]', error);
  }

  res.status(statusCode).json({
    success: false,
    message,
    data: null,
    ...(errors && errors.length > 0 ? { errors } : {}),
  });
};
