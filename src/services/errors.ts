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
