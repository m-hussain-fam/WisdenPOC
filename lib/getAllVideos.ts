import { API } from '../constants/api';

export type RemoteVideo = {
  key: string;
  fileName: string;
  url: string;
  thumbnailUrl: string;
  lastModified: string;
};

export async function getAllVideos() {
  const videos: RemoteVideo[] = [];
  let nextToken = '';

  do {
    const url = nextToken
      ? `${API.testVideosGet}?nextToken=${encodeURIComponent(nextToken)}`
      : API.testVideosGet;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Videos could not be loaded.');
    }

    const data = unwrap(await response.json());
    const page = Array.isArray(data.videos) ? data.videos : [];
    videos.push(...page.map(readVideo).filter((video) => video.key && video.url));
    nextToken = typeof data.nextToken === 'string' ? data.nextToken : '';
  } while (nextToken);

  return videos.sort((a, b) => Date.parse(b.lastModified) - Date.parse(a.lastModified));
}

function readVideo(item: unknown): RemoteVideo {
  const video = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
  const key = text(video.key);
  const url = text(video.url);
  return {
    key,
    fileName: text(video.fileName) || 'video.mp4',
    url,
    thumbnailUrl: text(video.thumbnailUrl),
    lastModified: text(video.lastModified),
  };
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function unwrap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const record = data as Record<string, unknown>;
  if (typeof record.body === 'string') {
    try {
      return unwrap(JSON.parse(record.body));
    } catch {
      return record;
    }
  }
  return record;
}
