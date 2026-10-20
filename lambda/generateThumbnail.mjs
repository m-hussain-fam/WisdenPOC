import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

// This Lambda is triggered by S3 when a new file is created under "videos/".
// It downloads the video, takes one frame with ffmpeg and saves it as a JPEG
// under "thumbnails/". It must NEVER write under "videos/", otherwise it would
// trigger itself again and again.

const run = promisify(execFile);
const s3 = new S3Client({});

// ffmpeg comes from a Lambda layer. Layers are unpacked into /opt.
const FFMPEG = "/opt/bin/ffmpeg";
const SOURCE_PREFIX = "videos/";
const THUMBNAIL_PREFIX = "thumbnails/";

export const handler = async (event) => {
  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    // S3 sends the key URL-encoded (spaces arrive as "+").
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    await createThumbnail(bucket, key);
  }
};

async function createThumbnail(bucket, key) {
  // Expected key: videos/<videoId>/<fileName>
  const parts = key.split("/");
  if (!key.startsWith(SOURCE_PREFIX) || parts.length < 3 || key.endsWith("/")) {
    console.log("Skipping key", key);
    return;
  }

  const videoId = parts[1];
  const thumbnailKey = thumbnailKeyFor(key);

  // /tmp is the only writable folder in Lambda. It can be reused between
  // invocations, so we always clean up in "finally".
  const workDir = path.join("/tmp", videoId);
  const inputPath = path.join(workDir, `input${path.extname(key) || ".mp4"}`);
  const outputPath = path.join(workDir, "thumb.jpg");

  try {
    await mkdir(workDir, { recursive: true });

    // 1) Download the video from S3 into /tmp
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    await pipeline(object.Body, createWriteStream(inputPath));

    // 2) Take one frame with ffmpeg
    await extractFrame(inputPath, outputPath);

    // 3) Upload the JPEG back to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: await readFile(outputPath),
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000",
      }),
    );

    console.log("Thumbnail created", thumbnailKey);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

// The thumbnail name is always built from the video name, so any code can find
// it without a database:
//   videos/<id>/clip.mp4      ->  thumbnails/<id>/clip.jpg
//   videos/<id>/my.clip.mov   ->  thumbnails/<id>/my.clip.jpg
//   videos/<id>/clip          ->  thumbnails/<id>/clip.jpg
// Use this same rule in getAllVideos and in the app.
function thumbnailKeyFor(videoKey) {
  const withoutExtension = videoKey.replace(/\.[^./]+$/, "");
  return withoutExtension.replace(/^videos\//, THUMBNAIL_PREFIX) + ".jpg";
}

// Try the 2nd second first. If the video is shorter than that, ffmpeg creates
// no picture, so we fall back to the very first frame.
async function extractFrame(inputPath, outputPath) {
  for (const second of [2, 0]) {
    try {
      await run(
        FFMPEG,
        [
          "-y",
          "-ss", String(second), // before -i = fast seek
          "-i", inputPath,
          "-frames:v", "1",
          // max 720px wide, keep the aspect ratio (a 9:16 video stays 9:16)
          "-vf", "scale='min(720,iw)':-2",
          "-q:v", "3",
          outputPath,
        ],
        { timeout: 30000 },
      );
      // ffmpeg can finish without an error but also without a picture
      await access(outputPath);
      return;
    } catch (error) {
      console.warn(`ffmpeg failed at second ${second}`, error.stderr || error.message);
    }
  }
  throw new Error("ffmpeg could not create a thumbnail.");
}
