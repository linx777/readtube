export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
    readonly status = 500,
    options?: { cause?: unknown },
  ) {
    super(publicMessage, options);
    this.name = 'AppError';
  }

  static from(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError('unexpected_error', error.message || '发生了未知错误。', 500, {
        cause: error,
      });
    }

    return new AppError('unexpected_error', '发生了未知错误。', 500, {
      cause: error,
    });
  }
}

export function formatErrorMessage(error: AppError): string {
  return error.publicMessage;
}

export interface ErrorResponsePayload {
  code: string;
  message: string;
  status: number;
}

export function toErrorResponsePayload(error: AppError): ErrorResponsePayload {
  return {
    code: error.code,
    message: formatErrorMessage(error),
    status: error.status,
  };
}

export function jsonErrorResponse(error: unknown): Response {
  const appError = AppError.from(error);

  return new Response(JSON.stringify(toErrorResponsePayload(appError)), {
    status: appError.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
