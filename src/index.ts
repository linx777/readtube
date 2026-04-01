import { handleGenerateRoute, handleMockGenerateRoute } from './routes/generate';
import { renderAppPage } from './ui/page';

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isHead = request.method === 'HEAD';

    if ((request.method === 'GET' || isHead) && url.pathname === '/') {
      return htmlResponse(isHead ? '' : renderAppPage());
    }

    if (request.method === 'POST' && url.pathname === '/api/generate') {
      return handleGenerateRoute(request, env, ctx);
    }

    if (request.method === 'POST' && url.pathname === '/api/mock-generate') {
      return handleMockGenerateRoute(request, env, ctx);
    }

    if ((request.method === 'GET' || isHead) && url.pathname === '/health') {
      return textResponse(isHead ? '' : 'ok');
    }

    return textResponse('Not found', 404);
  },
} satisfies ExportedHandler<Env>;
