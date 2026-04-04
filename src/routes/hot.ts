import type { Env } from '../index';
import { AppError } from '../services/errors';
import { listHotVideos, recordHotVideoView } from '../services/storage';

interface ViewRequestBody {
  videoId?: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  thumbnailUrl?: string;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function parseRequestBody(request: Request): Promise<ViewRequestBody> {
  try {
    return (await request.json()) as ViewRequestBody;
  } catch {
    throw new AppError('invalid_json', '请求体不是合法的 JSON。', 400);
  }
}

export async function handleHotRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const items = await listHotVideos(env, rawLimit);
  return jsonResponse({ items });
}

export async function handleViewRoute(request: Request, env: Env): Promise<Response> {
  const body = await parseRequestBody(request);

  await recordHotVideoView(env, {
    videoId: body.videoId ?? '',
    sourceTitle: body.sourceTitle ?? '',
    sourceAuthor: body.sourceAuthor ?? '',
    thumbnailUrl: body.thumbnailUrl ?? '',
  });

  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
    },
  });
}
