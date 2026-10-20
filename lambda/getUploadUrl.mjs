import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const bucket = process.env.BUCKET_NAME;
const region = process.env.AWS_REGION;
const expiresIn = Number(process.env.UPLOAD_EXPIRES_SECONDS || 900);

export const handler = async (event) => {
  try {
    const body = parseBody(event);
    const contentType = String(body.contentType || "").trim().toLowerCase();
    const fileName = safeFileName(body.fileName);

    if (!contentType.startsWith("video/")) {
      return json(400, { message: "contentType video/* hona chahiye, maslan video/mp4" });
    }
    if (!body.fileName || !fileName) {
      return json(400, { message: "fileName required hai" });
    }

    const key = `videos/${randomUUID()}/${fileName}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn });

    return json(200, {
      uploadUrl,
      key,
      contentType,
      expiresIn,
      publicUrl: publicObjectUrl(bucket, region, key),
    });
  } catch (error) {
    console.error("getUploadUrl failed", error);
    return json(500, { message: "Upload URL nahi ban saki" });
  }
};

function parseBody(event) {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw);
}

function safeFileName(name) {
  const base = String(name || "")
    .split(/[/\\]/)
    .pop()
    .trim();
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
}

function publicObjectUrl(bucketName, bucketRegion, key) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${encodedKey}`;
}

function json(statusCode, payload) {
  return {
    statusCode,
    body: JSON.stringify(payload),
  };
}
