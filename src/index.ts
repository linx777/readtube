import { handleGenerateRoute, handleGeminiTranslationUsageRoute } from './routes/generate';
import { handleHotRoute, handleViewRoute } from './routes/hot';
import { renderAppPage, renderBrandIconPng } from './ui/page';

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_INSIGHTS_MODEL?: string;
  GEMINI_DIALOGUE_MODEL?: string;
  SUPADATA_API_KEY?: string;
  SUPADATA_TRANSCRIPT_MODE?: string;
  CONTENT_CACHE?: KVNamespace;
  HOT_DB?: D1Database;
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

function textResponse(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function xmlResponse(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      ...headers,
    },
  });
}

function pngResponse(body: BodyInit | null, headers: HeadersInit = {}): Response {
  return new Response(body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400',
      ...headers,
    },
  });
}

function buildAbsoluteUrl(requestUrl: string, pathname: string): string {
  const url = new URL(requestUrl);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildRobotsTxt(requestUrl: string): string {
  const sitemapUrl = buildAbsoluteUrl(requestUrl, '/sitemap.xml');
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /health\n\nSitemap: ${sitemapUrl}\n`;
}

function buildSitemapXml(requestUrl: string): string {
  const canonicalUrl = buildAbsoluteUrl(requestUrl, '/');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${escapeXml(canonicalUrl)}</loc>\n  </url>\n</urlset>\n`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isHead = request.method === 'HEAD';

    if ((request.method === 'GET' || isHead) && url.pathname === '/') {
      return htmlResponse(
        isHead
          ? ''
          : renderAppPage({
            canonicalUrl: buildAbsoluteUrl(request.url, '/'),
            iconUrl: buildAbsoluteUrl(request.url, '/icon.png'),
          }),
      );
    }

    if ((request.method === 'GET' || isHead) && url.pathname === '/icon.png') {
      return pngResponse(isHead ? null : renderBrandIconPng());
    }

    if ((request.method === 'GET' || isHead) && url.pathname === '/robots.txt') {
      return textResponse(isHead ? '' : buildRobotsTxt(request.url), 200, {
        'cache-control': 'public, max-age=3600',
      });
    }

    if ((request.method === 'GET' || isHead) && url.pathname === '/sitemap.xml') {
      return xmlResponse(isHead ? '' : buildSitemapXml(request.url));
    }

    if (request.method === 'POST' && url.pathname === '/api/generate') {
      return handleGenerateRoute(request, env, ctx);
    }

    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/gemini-translation-usage') {
      return handleGeminiTranslationUsageRoute(request);
    }

    if ((request.method === 'GET' || isHead) && url.pathname === '/api/hot') {
      if (isHead) {
        return textResponse('', 200);
      }
      return handleHotRoute(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/view') {
      return handleViewRoute(request, env);
    }

    if ((request.method === 'GET' || isHead) && url.pathname === '/health') {
      return textResponse(isHead ? '' : 'ok', 200, {
        'x-robots-tag': 'noindex, nofollow',
      });
    }

    return textResponse('Not found', 404, {
      'x-robots-tag': 'noindex, nofollow',
    });
  },
} satisfies ExportedHandler<Env>;
