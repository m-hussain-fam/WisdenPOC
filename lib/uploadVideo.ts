import { File, UploadType } from 'expo-file-system';
import { API } from '../constants/api';

type UploadInput = {
  uri: string;
  fileName: string;
  contentType: string;
  onProgress?: (percent: number) => void;
};

export async function uploadVideo({ uri, fileName, contentType, onProgress }: UploadInput) {
  const response = await fetch(API.uploadVideo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType }),
  });

  if (!response.ok) {
    throw new Error('Could not get an upload link.');
  }

  const data = unwrap(await response.json());
  const uploadUrl = text(data.uploadUrl);

  if (!uploadUrl) {
    throw new Error('The server did not return an upload link.');
  }

  const result = await new File(uri).upload(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: contentType,
    headers: { 'Content-Type': contentType },
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(Math.round((bytesSent / totalBytes) * 100));
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`The video could not be uploaded (${result.status}).`);
  }

  onProgress?.(100);
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
