# Thumbnail Lambda: trigger, presigned URL, S3 Files, CloudFront

Zubaan: Roman Urdu, technical words English mein.

Yeh file `lambda/generateThumbnail.mjs` ke aage ke kaam ke liye hai. Is mein 4 cheezein hain:

1. Lambda ko **trigger** kaise karna hai (video upload hote hi chale).
2. **Presigned URL** wala tareeqa (video download kiye bagair frame nikalna).
3. AWS ka **naya S3 Files feature** (bina `/tmp` download ke), aur wo kaise kaam karta hai.
4. **CloudFront (CDN)** ko S3 se kaise jorna hai taake streaming tez ho.

Status: Yeh sab sirf plan aur reference hai. Is file ka koi code AWS par chala kar test nahi kiya gaya. Pehle dev account mein aazmao.

Region: Sab kuch **ek hi region** mein (abhi `eu-central-1`). Section 4 (CloudFront) ke siwa, wo global hai.

---

## 0. Khulasa

| Sawal | Jawab |
| --- | --- |
| Lambda ko kaise chalayen? | S3 bucket ka **Event notification**: `videos/` mein nayi file bane to Lambda chale. (Section 1) |
| Video download kiye bagair frame? | Haan: S3 ka **presigned GET link** ffmpeg ko do. ffmpeg sirf zaroori hissa parhta hai. (Section 2) |
| AWS ka naya feature? | **Amazon S3 Files** (April 2026): bucket ko Lambda mein folder jaisa mount karo. Lekin Lambda ko **VPC** mein rakhna parta hai aur kuch pabandiyan hain. (Section 3) |
| Streaming tez kaise? | S3 ke aage **CloudFront**. App ko CloudFront ka link do, S3 ka nahi. (Section 4) |
| POC ke liye meri raaye | Trigger lagao + (abhi wali download ya presigned URL) + CloudFront. S3 Files abhi mat lagao. |

---

## 1. Lambda ko trigger kaise karein (video upload ho to chale)

### Kaise kaam karta hai

```
App ──PUT──► S3 (videos/<id>/clip.mp4)
                  │
                  │  S3 khud "ObjectCreated" event bhejta hai
                  ▼
            Lambda generateThumbnail  ──►  S3 (thumbnails/<id>/clip.jpg)
```

- **App Lambda ko call nahi karti.** S3 khud Lambda ko batata hai jab koi nayi file ban jati hai.
- Event tab aata hai jab file **poori upload** ho chuki hoti hai. Adhoori file par Lambda nahi chalta.
- S3 Lambda ko **asynchronously** call karta hai (jawab ka intezar nahi karta). Agar Lambda fail ho to AWS khud **2 baar dobara** koshish karta hai.

### Tareeqa A: Lambda console se (sab se aasan)

1. AWS Console mein region **`eu-central-1`** chuno.
2. **Lambda**, phir `generateThumbnail`, phir **Add trigger**.
3. Source: **S3**.
4. Bucket: `bucketforvideoswisden`.
5. Event types: **All object create events** (`s3:ObjectCreated:*`).
6. Prefix: **`videos/`** (yeh bohat zaroori hai, neeche dekho).
7. Suffix: khali chhor do.
8. Neeche "Recursive invocation" wale checkbox ko tick karo (samajh kar, neeche wajah likhi hai).
9. **Add**.

Console S3 ko Lambda chalane ki **permission** bhi khud de deta hai. Alag se kuch nahi karna.

### Tareeqa B: S3 console se

S3, phir apna bucket, phir **Properties**, phir **Event notifications**, phir **Create event notification**:

- Name: `generate-thumbnail-on-upload`
- Prefix: `videos/`
- Event types: **All object create events**
- Destination: **Lambda function**, phir `generateThumbnail` chuno.

### Tareeqa C: CLI (IaC jaisa, dobara chalane ke liye)

Pehle S3 ko Lambda chalane ki permission do:

```bash
aws lambda add-permission \
  --function-name generateThumbnail \
  --statement-id s3-invoke \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::bucketforvideoswisden \
  --source-account <ACCOUNT_ID> \
  --region eu-central-1
```

Phir `notification.json`:

```json
{
  "LambdaFunctionConfigurations": [
    {
      "Id": "generate-thumbnail-on-upload",
      "LambdaFunctionArn": "arn:aws:lambda:eu-central-1:<ACCOUNT_ID>:function:generateThumbnail",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": { "FilterRules": [{ "Name": "prefix", "Value": "videos/" }] }
      }
    }
  ]
}
```

```bash
aws s3api put-bucket-notification-configuration \
  --bucket bucketforvideoswisden \
  --notification-configuration file://notification.json
```

Dhyan: yeh command bucket ki **poori** notification setting **badal deta hai** (add nahi karta). Agar pehle se koi aur trigger ho to usay bhi isi file mein likho.

### Prefix kyun `videos/`? (Infinite loop se bachna)

Lambda thumbnail ko `thumbnails/` mein likhta hai. Agar trigger poore bucket par ho aur Lambda `videos/` mein likhe, to har nayi file naya trigger banati aur Lambda khud ko baar baar chalata (bill barh jata). Humare paas yeh teen cheezein hain jo bachati hain:

1. Trigger sirf `videos/` par.
2. Lambda sirf `thumbnails/` mein likhta hai.
3. Lambda ke code mein bhi check hai: `videos/` se na shuru hone wali key chhor deta hai.

### Permissions (Lambda ke role mein)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::bucketforvideoswisden/videos/*" },
    { "Effect": "Allow", "Action": "s3:PutObject", "Resource": "arn:aws:s3:::bucketforvideoswisden/thumbnails/*" }
  ]
}
```

Plus logs ke liye `AWSLambdaBasicExecutionRole`.

### Lambda ki settings (Configuration tab)

Default settings is kaam ke liye kam parti hain. Lambda, phir **Configuration**, phir **General configuration**, phir **Edit**:

| Setting | Kitni rakhein | Wajah |
| --- | --- | --- |
| **Timeout** | **30 se 60 second** | Default 3 second hai. Download aur ffmpeg 3 second mein khatam nahi hote, Lambda beech mein kat jata hai. |
| **Memory** | **512 MB ya zyada** | ffmpeg ko RAM chahiye. Zyada memory se CPU bhi zyada milta hai, to kaam tez hota hai. |
| **Ephemeral storage** (`/tmp`) | Default **512 MB** kaafi hai | Ab sirf pehle 5 MB utarte hain (neeche dekho). Poori video par wapas aaye to bhi shorts ke liye theek hai. |
| **Architecture** | **arm64** | ffmpeg layer arm64 par bana hai. Lambda aur layer ki architecture same honi chahiye. |
| **Runtime** | Node.js 20.x ya 22.x | Code `.mjs` (ES module) hai. |
| **Layer** | ffmpeg layer jora hua | `/opt/bin/ffmpeg` is layer se aata hai. |

### Pehle sirf 5 MB download hota hai (Range request)

Code ab poori video download nahi karta. `generateThumbnail.mjs` mein `PARTIAL_BYTES = 5 * 1024 * 1024` hai, aur S3 se `Range: bytes=0-5242879` ke saath sirf **pehle 5 MB** manga jata hai.

```
1) Pehle 5 MB download  ->  2nd second ka frame nikalo
2) Agar ye nakam ho (file adhoori hone ki wajah se)  ->  poori video download karo  ->  dobara frame nikalo
```

Is se ye hota hai:
- Aksar videos ke liye download kam hota hai, to Lambda tez chalta hai aur S3 se data kam jata hai.
- Range **bytes** mein hoti hai, seconds mein nahi. 5 MB ki video kitne second ki hogi, ye bitrate par depend karta hai. Phone ki 1080p video mein 5 MB aam taur par pehle 5 se 10 second hote hain.
- Agar MP4 ka `moov` (metadata) hissa file ke **aakhir mein** ho, to pehle 5 MB se frame nahi niklega. Tab code khud poori video par wapas jata hai, to thumbnail phir bhi ban jata hai.
- Logs mein dekh sakte ho kaunsa raasta chala: `Used only the first part of the video` ya `Partial download was not enough, using the whole video`.

Purana "poori video download" wala code file mein comment kar ke rakha hai (`OLD CODE`), taake zaroorat par wapas aa sako.

### Test kaise karein

**1) Lambda console mein hath se (upload ke baghair).** Lambda, phir **Test**, phir yeh event paste karo (apni kisi maujooda video ki key daalo):

```json
{
  "Records": [
    {
      "s3": {
        "bucket": { "name": "bucketforvideoswisden" },
        "object": { "key": "videos/dfd8086b-a77b-4f99-88d7-2cc4c5aaf0f9/1000175661.mp4" }
      }
    }
  ]
}
```

**2) Asli upload se.** App se video upload karo, phir Lambda ke **Monitor**, phir **View CloudWatch logs** mein "Thumbnail created ..." dekho, aur S3 mein `thumbnails/<id>/<naam>.jpg` check karo.

### Purani videos ka thumbnail (backfill)

Trigger sirf **nayi** files par chalta hai. Jo videos pehle se bucket mein hain unke liye upar wala hath ka test event har video ki key ke saath chalao. (Ya chhota script likho jo `videos/` ko list kare aur har key par Lambda invoke kare.)

### Aam masle

| Alamat | Wajah |
| --- | --- |
| Trigger kabhi chalta hi nahi | Bucket aur Lambda alag **region** mein, ya prefix ghalat, ya S3 ko invoke ki permission nahi |
| Lambda baar baar chalta hai | Trigger poore bucket par aur Lambda wohi folder mein likh raha hai |
| Ek hi video par do baar chala | Events **at-least-once** hote hain. Humara kaam dobara chalane se bhi theek rehta hai (wohi file overwrite hoti hai), is liye masla nahi |
| Fail hone par kuch nahi | Lambda ke **Asynchronous invocation** settings mein on-failure destination (SQS/SNS) lagao, taake nakam events dikhein |
| `AccessDenied` | Role mein `GetObject`/`PutObject` ki policy nahi, ya bucket ka naam ghalat |
| Key mein ajeeb characters | S3 key URL-encode karke bhejta hai. Humare code mein `decodeURIComponent` is liye hai |

### Baad mein (production)

S3 se **EventBridge** ko events bhejna aur wahan se Step Functions chalana zyada flexible hai (retries, kayi steps). Guide ke Section 6 mein hai. POC ke liye seedha Lambda trigger kaafi hai.

---

## 2. Presigned URL wala method (video download kiye bagair)

### Abhi kya hota hai

`generateThumbnail.mjs` pehle **poori video** S3 se `/tmp` mein utaar ta tha. Ab wo pehle sirf **5 MB** utarta hai (Range request, Section 1 mein "Pehle sirf 5 MB download hota hai" dekho) aur nakam hone par hi poori video leta hai. Neeche wala presigned URL method us se bhi aage ka tareeqa hai.

### Naya tareeqa

S3 ka ek **temporary GET link** banao aur seedha ffmpeg ko do. ffmpeg HTTPS se video parh sakta hai aur sirf zaroori hissa maangta hai (HTTP **Range** request). 2nd second ka frame nikalne ke liye aam taur par poori video ki zaroorat nahi hoti.

```
Pehle:   S3 ──(poori video)──► /tmp ──► ffmpeg ──► JPEG ──► S3
Ab:      S3 ◄─(chhote hisse)── ffmpeg ──► JPEG ──► S3
```

### Code ka change

`lambda/generateThumbnail.mjs` mein:

```js
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
```

`createThumbnail` ke andar download wali lines (`GetObjectCommand` aur `pipeline(...)`) hata kar:

```js
// 5 minute chalne wala GET link
const videoUrl = await getSignedUrl(
  s3,
  new GetObjectCommand({ Bucket: bucket, Key: key }),
  { expiresIn: 300 },
);

await extractFrame(videoUrl, outputPath); // inputPath ki jagah link
```

`inputPath` aur `input.mp4` file ki ab zaroorat nahi. `extractFrame` ko badalna nahi parta, kyunke `-i` ke baad link bhi chalta hai.

Link mein `&` waghera hote hain. Humara code `execFile` use karta hai (shell nahi), is liye link bina quote ke bhi theek jata hai.

### Fayde aur nuksan

| | Poori download | Presigned URL |
| --- | --- | --- |
| Data jo uthaya jata hai | Poori video | Sirf zaroori hissa |
| `/tmp` ki jagah | Video jitni | Lagbhag zero |
| Bari file | `/tmp` ki limit (10 GB tak) | Koi masla nahi |
| Code | Aasan, bharosemand | Thora naya, ffmpeg ko HTTPS chahiye |
| Agar MP4 ka metadata (`moov`) aakhir mein ho | Koi masla nahi | ffmpeg pehle aakhir tak seek karta hai (range se), phir bhi chal jata hai lekin zyada requests |

### Check karo ke ffmpeg HTTPS jaanta hai

CloudShell ya laptop par apna ffmpeg build check karo:

```bash
./ffmpeg -protocols 2>&1 | grep https
```

`https` dikhna chahiye. Agar nahi dikhta to yeh tareeqa us build ke saath nahi chalega.

### Meri raaye

Shorts (<= 60 second) ke liye abhi wali download theek hai. Jab videos bari ho jayen ya `/tmp` bharne lage, tab presigned URL laga do. Pehle ek video par test karo.

---

## 3. AWS ka naya feature: Amazon S3 Files (bina `/tmp` download ke)

Yeh wohi feature hai jis ka tum ne suna tha. AWS ne **21 April 2026** ko elaan kiya ke Lambda ab **S3 Files** se S3 bucket ko file system ki tarah mount kar sakta hai.

Sources:
- [AWS announcement (Apr 2026)](https://aws.amazon.com/about-aws/whats-new/2026/04/aws-lambda-amazon-s3/)
- [AWS Compute Blog: Modernizing Lambda + S3 workloads with S3 Files](https://aws.amazon.com/blogs/compute/modernizing-lambda-s3-workloads-with-amazon-s3-files/)
- [Lambda docs: Configuring S3 Files access](https://docs.aws.amazon.com/lambda/latest/dg/configuration-filesystem-s3files.html)
- [S3 docs: Working with S3 Files](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files.html)
- [S3 docs: How synchronization works](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-synchronization.html)

### Kya hai

S3 Files, **Amazon EFS** par bana hua ek shared file system hai jo tumhare S3 bucket se jura hota hai. Lambda us ko ek folder (jaise `/mnt/data`) ki tarah mount kar leta hai. Phir code S3 ki API ki jagah **normal file paths** use karta hai:

```
Purana:   s3.download_file(bucket, key, '/tmp/file')   ... process ...   s3.upload_file(...)
Naya:     open('/mnt/data/' + key)                     ... process ...   (upload khud ho jata hai)
```

### Kaise kaam karta hai (andar ki baat)

1. Tum bucket ke liye ek **S3 file system** banate ho. Bucket ke objects ek folder tree ki tarah nazar aate hain.
2. Jab Lambda koi file kholta hai, S3 Files uska data **zaroorat par** apni tez storage par laata hai (poora bucket copy nahi hota).
3. Bari reads (>= 1 MiB) seedha **S3 se stream** hoti hain. Chhoti files (default < 128 KiB) tez storage par aa jati hain.
4. Jo tum file system mein **likhte** ho, wo bhi pehle tez storage par jata hai, aur phir S3 ko **wapas sync** hota hai.
5. Sync ke liye S3 Files **taqreeban 60 second** intezar karta hai ke file mein koi aur likhai na ho, phir S3 mein ek naya object (version) bana deta hai.
6. S3 mein seedha aane wali nayi files file system mein **aam taur par kuch seconds mein** nazar aa jati hain.
7. Agar dono taraf se ek hi file badli to **S3 ka version jeetta hai**.

### Jo cheezein lagti hain (pabandiyan)

| Zaroorat | Tafseel |
| --- | --- |
| **VPC** | Lambda ko VPC mein hona chahiye, aur file system ke **mount target** ke saath. Bina VPC ke Lambda ke liye S3 Files kaam nahi karta. |
| **Network rule** | Lambda aur mount target ke darmiyan **NFS port 2049** khula ho (security group). |
| **S3 Versioning** | Bucket par **Versioning on** hona zaroori hai. |
| **IAM** | Lambda role mein `s3files:ClientMount` (aur likhne ke liye `s3files:ClientWrite`). Bari files ke direct read ke liye `s3:GetObject`, `s3:GetObjectVersion` bhi. Managed policy: `AmazonS3FilesClientReadWriteAccess`. |
| **Memory** | Lambda ki memory **512 MB ya zyada** ho to bari files seedha S3 se tez parhi jati hain. |
| **Delay** | Likhi hui file S3 mein dikhne mein **~60 second** lagte hain. |
| **Cost** | Lambda ke saath S3 Files ka alag charge nahi hai lekin file system ki tez storage (jitna data wahan rehta hai) aur read/write ke charges lagte hain. Standard Lambda aur S3 ke kharche alag. Pricing page dekho. |
| **Kab nahi** | Jab S3 ki apni features chahiye (presigned URL, multipart upload waghera), ya Lambda VPC ke bahar ho. |

### Setup (console)

1. **VPC**: private subnets aur ek security group banao (NFS 2049 ki ijazat).
2. Bucket par **Versioning** on karo.
3. S3 console mein bucket ke liye **S3 file system** banao. Is se file system, mount targets aur access point ban jate hain.
4. Lambda ko usi **VPC aur subnets** mein daalo.
5. Lambda role mein `AmazonS3FilesClientReadWriteAccess` jodo.
6. Lambda, phir **Configuration**, phir **File systems**, phir **Add file system**, phir **S3 Files**:
   - S3 file system: apna chuno
   - Access point: chuno (agar nahi hai to Lambda khud banata hai, root folder `/lambda`)
   - Local mount path: `/mnt/data`
7. **Save**.

### Hamare thumbnail Lambda mein kaisa dikhta (sketch, test nahi kiya)

```js
import path from "node:path";
import { access, mkdir } from "node:fs/promises";

const MOUNT = "/mnt/data";

async function createThumbnail(key) {
  const input = path.join(MOUNT, key);                       // /mnt/data/videos/<id>/clip.mp4
  const output = path.join(MOUNT, thumbnailKeyFor(key));     // /mnt/data/thumbnails/<id>/clip.jpg

  await waitForFile(input);                                  // file kuch second baad mount mein aati hai
  await mkdir(path.dirname(output), { recursive: true });
  await extractFrame(input, output);                         // ffmpeg ko seedha mount ka path do
  // upload ki zaroorat nahi: thumbnail ~60 second mein khud S3 mein chali jati hai
}

async function waitForFile(filePath, tries = 15) {
  for (let i = 0; i < tries; i++) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`File not found in the mount: ${filePath}`);
}
```

Dhyan:
- `waitForFile` meri apni ehtiyaat hai. Docs ke mutabiq S3 ki nayi file mount mein "aam taur par kuch seconds" mein aati hai, aur trigger foran chalta hai.
- Mount ke andar bucket ka root kahan hai (access point ki root directory par depend karta hai). Pehle Lambda mein `ls /mnt/data` karwa kar dekho.
- `S3Client`, `GetObject`, `PutObject` ki zaroorat nahi rehti, lekin trigger wahi S3 event rehta hai.

### Humare liye faisla

| Sawal | Jawab |
| --- | --- |
| Faida? | Download/upload ka code khatam, `/tmp` ki limit nahi, shared folder. |
| Kya POC mein lagayen? | **Nahi.** VPC, mount target, versioning, extra IAM aur 60 second ka delay: thumbnail ke chhote kaam ke liye zaroorat se zyada. |
| Kab lagayen? | Jab ek hi file par kayi Lambda step chalein (probe, thumbnail, transcode), ya video **bohat bari** ho, ya `/tmp` ka masla aaye. |
| Aur ek baat | VPC mein Lambda ko internet (jaise server ko callback) ke liye **NAT Gateway** chahiye (extra kharcha), aur S3 ke liye **Gateway endpoint** (free). |

Thumbnail ke liye aasan tareeqa: **poori download** (abhi) ya **presigned URL** (Section 2).

---

## 4. CloudFront (CDN) ko S3 se kaise jorna hai (streaming tez)

### Kya fayda hota hai

```
Pehle:   App ───────────────────────────► S3 (eu-central-1)
Ab:      App ──► CloudFront (paas ka server) ──► S3 (sirf pehli baar)
```

- Video ki copy duniya ke **edge servers** par cache ho jati hai, user ko paas se milti hai.
- CloudFront S3 tak AWS ke apne network se jata hai (aam internet se behtar).
- Dobara dekhne par S3 tak jana nahi parta.
- CloudFront **Range requests** support karta hai, is liye MP4 play hote hote download ho sakti hai (progressive streaming) aur seek bhi chalta hai.
- Upload **seedha S3** par hi rehta hai (presigned PUT). CloudFront sirf dekhne ke liye.
- **Pehli baar** koi video maangi jaye to wo phir bhi S3 se aati hai (cache miss). CDN ka fayda tab zyada hota hai jab ek video kayi log dekhein ya dobara dekhein. Video ka chhota (transcode) hona phir bhi zaroori hai.

### Step 1: Distribution banao

Console, phir **CloudFront**, phir **Create distribution**:

| Setting | Value |
| --- | --- |
| Origin domain | Dropdown se apna S3 bucket (`bucketforvideoswisden.s3.eu-central-1...`). **Website endpoint wala nahi.** |
| Origin access | **Origin access control settings (recommended)**, phir **Create new OAC** (default theek) |
| Viewer protocol policy | **Redirect HTTP to HTTPS** |
| Allowed HTTP methods | GET, HEAD |
| Cache policy | **CachingOptimized** |
| WAF | Abhi na lagao |
| Price class | Abhi "Use all edge locations" |

**Create** karo. 5 minute baad domain milega, jaise `d1234abcd.cloudfront.net`.

### Step 2: Bucket policy (CloudFront ko parhne ki ijazat)

OAC banane ke baad console "Copy policy" dikhata hai. Bucket ki **Permissions**, phir **Bucket policy** mein jodo:

```json
{
  "Sid": "AllowCloudFrontRead",
  "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": "s3:GetObject",
  "Resource": [
    "arn:aws:s3:::bucketforvideoswisden/videos/*",
    "arn:aws:s3:::bucketforvideoswisden/thumbnails/*"
  ],
  "Condition": {
    "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  }
}
```

Purani statements abhi mat hatao.

### Step 3: Test

```powershell
curl.exe -I https://d1234abcd.cloudfront.net/videos/<id>/<naam>.mp4
```

- `HTTP/... 200` aana chahiye.
- Pehli baar `x-cache: Miss from cloudfront`, dobara `Hit from cloudfront`.

Range ka test (progressive streaming kaam karti hai):

```powershell
curl.exe -s -r 0-99999 -o NUL -w "%{http_code} %{size_download}\n" https://d1234abcd.cloudfront.net/videos/<id>/<naam>.mp4
```

`206 100000` aana chahiye (yani sirf 100 KB aaye).

### Step 4: App ko CloudFront ka link do

`getAllVideos` Lambda ke **Environment variables** mein `CDN_DOMAIN` = `d1234abcd.cloudfront.net` daalo, aur function mein:

```js
const cdnDomain = process.env.CDN_DOMAIN; // d1234abcd.cloudfront.net

function publicObjectUrl(bucketName, bucketRegion, key) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (cdnDomain) return `https://${cdnDomain}/${encodedKey}`;
  return `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${encodedKey}`;
}
```

`CDN_DOMAIN` na ho to purana S3 link chalta rahega, to rollback aasan hai. App mein koi change nahi, kyunke wo Lambda ka diya `url` use karti hai. Thumbnails ka link bhi isi function se banega (jab `thumbnailUrl` joro).

### Step 5: Bucket ko private karo

Jab CloudFront ka link theek chal jaye to:

1. Bucket ki purani **public read** wali policy hata do.
2. **Block public access** on kar do.

Phir video sirf CloudFront se milegi. Upload par asar nahi (presigned PUT apni signature se chalta hai). Lambdas IAM se S3 tak jate hain, wo bhi theek rehte hain.

### Streaming ko aur tez kaise karein

| Cheez | Kya karna |
| --- | --- |
| MP4 ka `moov` shuru mein | Phone ki videos mein aksar pehle se hota hai (humari test video mein tha). Transcode ke waqt `-movflags +faststart` lagao. |
| Video chhoti karo | 720p, kam bitrate, H.264. Sab se bara asar. (Guide Section 8) |
| HLS | Chhote segments aur kayi quality; net slow ho to khud quality kam. CloudFront mein `.m3u8` ki **chhoti** cache (jaise 5-10 second), `.ts` segments ki **lambi** cache. |
| Cache | Humare paths `videos/<uuid>/...` kabhi badalte nahi, is liye lambi cache theek hai. Default 24 ghante. |
| Region | S3 aur Lambdas users ke qareeb region mein (pichhle test mein UAE `me-central-1` sab se qareeb tha). Uske liye region enable karna parta hai. |
| Preload / cache app mein | `expo-video` ka `useCaching: true`: dobara dekhne par foran chalti hai. |

### Aage production mein

| Zaroorat | Kya |
| --- | --- |
| Apna domain | `cdn.tumhara-site.com` + HTTPS certificate (**ACM**, CloudFront ke liye certificate `us-east-1` mein banta hai) |
| Private/paid videos | CloudFront **signed URLs / signed cookies** |
| Kharcha | AWS ka free tier dekho (CloudFront ka kuch data mahine mein free hota hai), baqi pricing page par |
| Nigrani | CloudFront ka cache hit ratio aur errors CloudWatch mein |

---

## 5. Order mein kya karna hai (POC)

1. **Section 1**: S3 trigger lagao, ek video upload karke thumbnail check karo.
2. `getAllVideos` mein `thumbnailUrl` joro (thumbnail ka naam video ke naam se banta hai, rule `thumbnailKeyFor` mein likha hai).
3. **Section 4**: CloudFront lagao, `CDN_DOMAIN` set karo.
4. Jab videos bari ya zyada hon to Section 2 (presigned URL).
5. S3 Files (Section 3) tab, jab pipeline mein kayi Lambda step ho jayen.
