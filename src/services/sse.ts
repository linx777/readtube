const encoder = new TextEncoder();

export type SseEventName = 'meta' | 'html' | 'cache' | 'insights' | 'error' | 'done';

export function createSseResponse(): {
  response: Response;
  writer: WritableStreamDefaultWriter<Uint8Array>;
} {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  return {
    response: new Response(readable, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    }),
    writer: writable.getWriter(),
  };
}

export async function sendSseEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  event: SseEventName,
  payload: unknown,
): Promise<void> {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  await writer.write(encoder.encode(body));
}
