import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const bucket = process.env.BUCKET_NAME;
const region = process.env.AWS_REGION;
const prefix = "videos/";

export const handler = async (event) => {
  try {
    const nextToken = event.queryStringParameters?.nextToken || undefined;
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 100,
        ContinuationToken: nextToken,
      }),
    );

    const videos = (result.Contents || [])
      .filter((item) => item.Key && !item.Key.endsWith("/"))
      .map((item) => ({
        key: item.Key,
        fileName: item.Key.split("/").pop(),
        size: item.Size,
        lastModified: item.LastModified,
        url: publicObjectUrl(bucket, region, item.Key),
      }));

    return json(200, {
      videos,
      nextToken: result.IsTruncated ? result.NextContinuationToken : null,
    });
  } catch (error) {
    console.error("getAllVideos failed", error);
    return json(500, { message: "error in loading video list" });
  }
};

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
