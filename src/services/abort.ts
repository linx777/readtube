import { AppError } from './errors';

export function createAbortError(reason?: unknown): AppError {
  if (reason instanceof AppError && reason.code === 'request_aborted') {
    return reason;
  }

  return new AppError('request_aborted', '请求已取消。', 499, {
    cause: reason,
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof AppError && error.code === 'request_aborted')
    || (error instanceof Error && error.name === 'AbortError')
  );
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw createAbortError(signal.reason);
  }
}

export async function sleepWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(createAbortError(signal?.reason));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
