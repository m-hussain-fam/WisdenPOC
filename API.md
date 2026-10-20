# Video API

Two steps to upload. First ask for an upload link. Then upload the video file to that link. Listing videos is a separate call.

Videos are stored like this:

```text
videos/<id>/clip.mp4
```

## 1. Get an upload link

`POST https://fedkttqknatbu4nffeaawdhaey0jzklf.lambda-url.eu-central-1.on.aws/`

Header: `Content-Type: application/json`

Body:

```json
{
  "fileName": "clip.mp4",
  "contentType": "video/mp4"
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `fileName` | yes | Video file name only, for example `clip.mp4`. No folders. |
| `contentType` | yes | Must start with `video/`, for example `video/mp4`. |

Success `200`:

```json
{
  "uploadUrl": "https://<bucket>.s3.<region>.amazonaws.com/videos/<id>/clip.mp4?...",
  "key": "videos/<id>/clip.mp4",
  "contentType": "video/mp4",
  "expiresIn": 900,
  "publicUrl": "https://<bucket>.s3.<region>.amazonaws.com/videos/<id>/clip.mp4"
}
```

`uploadUrl` expires after `expiresIn` seconds (900 by default). `publicUrl` is the lasting address.

Errors:

| Status | When | Body |
| --- | --- | --- |
| 400 | `contentType` is not a video | `{ "message": "contentType video/* hona chahiye, maslan video/mp4" }` |
| 400 | `fileName` is missing | `{ "message": "fileName required hai" }` |
| 500 | The link could not be created | `{ "message": "Upload URL nahi ban saki" }` |

## 2. Upload the video

This call does not send JSON. The body is the file itself.

```http
PUT <uploadUrl>
Content-Type: video/mp4

<video bytes>
```

Send the same `Content-Type` as in step 1 so the stored file gets the right type. The link itself does not enforce it. A `200` from S3 means the file is stored. There is no extra response body to parse.

## 3. List videos

`GET https://6ojyjxsgs7hukz57kegircqvca0gnice.lambda-url.us-east-1.on.aws/`

No body.

Optional query, only when the previous response included a `nextToken`:

```text
?nextToken=<token from the previous response>
```

Success `200`:

```json
{
  "videos": [
    {
      "key": "videos/<id>/clip.mp4",
      "fileName": "clip.mp4",
      "size": 9820013,
      "lastModified": "2026-10-16T16:56:26.000Z",
      "url": "https://<bucket>.s3.<region>.amazonaws.com/videos/<id>/clip.mp4"
    }
  ],
  "nextToken": null
}
```

If `nextToken` is `null`, there are no more pages.

Error `500`:

```json
{ "message": "error in loading video list" }
```

The list handler must read the same bucket as upload. The list URL above is the current app URL. Replace it when the list function is deployed for the new bucket.
