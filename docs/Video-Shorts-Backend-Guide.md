# Video Shorts Backend Guide (Kingsmen Cricket)

Yeh guide ek junior developer ke liye hai. Is ko parh kar kisi aur search ki zaroorat nahi honi chahiye.

Zubaan: Roman Urdu, technical words English mein.
Status: Yeh sirf plan aur reference examples hain. Is guide ka koi code abhi app ya AWS mein lagaya nahi gaya. Code examples AWS pe test kiye bagair likhe hain, isliye pehle dev account mein chala kar dekho.

---

## 0. 2 minute ka khulasa (TL;DR)

| Sawal | Jawab |
| --- | --- |
| Lambda ya server? | **Serverless**: API Gateway + Lambda + DynamoDB + S3. Server (ECS Fargate) sirf tab, jab Lambda ki limits kam parein. |
| Video ka kaam (ffmpeg) API ke andar kabhi nahi | Video upload hone ke baad **alag pipeline** mein hota hai (S3 event se shuru). |
| Auth kaise? | **Amazon Cognito** (login) + JWT token + API Gateway ka JWT authorizer. Apna password system mat banao. |
| Database? | **DynamoDB** (video ka data). Video file S3 mein, data DynamoDB mein. SQL/Mongo ka muqabla Section 7 mein. |
| Thumbnail? | Server pe ffmpeg se (Lambda). App se alag upload nahi. |
| Playback? | S3 private + **CloudFront** CDN. Production mein **HLS**. |
| User ko kaise pata chale? | Pehle polling (`GET /videos/{id}`), phir push notification. |
| Hamara server pehle se hai, phir? | **Hybrid**: server (login, DB, endpoints) + AWS (S3, pipeline, ffmpeg). Section 19. `getAllVideos` bhi server pe, DB se. |
| Pipeline ke baad server ko kaise bataye? | **Callback/webhook** (signed + retry), production mein queue/EventBridge. Section 20. |
| ffmpeg ECS mein ho to connections ka masla? | Worker DB se baat hi na kare. ECS mein masla khatam nahi hota, sirf badalta hai. Section 21. |
| Production ki lazmi cheezein? | Section 22 ka checklist. |
| Abhi kya karna hai? | Section 16 ka roadmap, Phase 1 se. |

---

## 1. Hamara target: Shorts

Shorts ka matlab:

- Chhoti vertical video, 60 second tak, ratio **9:16** (jaise 1080x1920).
- Feed mein upar neeche swipe, har video khud play.
- Video **foran** start honi chahiye. Is liye CDN, chhote HLS segments, aur thumbnail (poster) lazmi hain.
- Phones se alag alag formats aate hain (iPhone ki `.mov`/HEVC, Android ki `.mp4`). Server ko sab ko ek standard format (H.264 + AAC) mein badalna parega.

Production grade ka matlab: login, ownership, retries, monitoring, security, aur cost control. Sirf "upload chal gaya" kaafi nahi.

---

## 2. Abhi hamare paas kya hai (POC) aur production tak gap

POC ka flow:

```
App ──POST──► Lambda (getUploadUrl) ──► presigned URL
App ──PUT───► S3
App ──GET───► Lambda (getAllVideos) ──► S3 listing
```

Yeh POC ke liye theek hai. Production mein yeh cheezein masla hain:

| POC mein | Masla | Production mein |
| --- | --- | --- |
| Lambda Function URL, auth nahi | Humne `curl` se bina login ke dono URLs chala liye. Koi bhi link ban sakta hai aur S3 bhar sakta hai. | API Gateway + Cognito login |
| S3 listing se videos ki list | Category, sorting, status kuch nahi hota. List badi ho to sust. | DynamoDB table |
| Title aur category UI mein hain, kahin save nahi | Data ghayab | `POST /videos` mein title/category bhej kar DB mein save |
| Key mein user ka file name | Gandi/lambi names, takrao | Server key banaye: `raw/{userId}/{videoId}/original.mp4` |
| Public S3 URLs | Koi bhi download kare, bandwidth ka kharcha | S3 private, CloudFront se delivery |
| Thumbnail phone se | Do upload, adhoori upload ka masla, koi bhi image bhej sakta hai | Server pe ffmpeg |
| Koi processing nahi | 4K ya HEVC video seedha | Pipeline: validate, thumbnail, transcode |
| Gallery se lambi video ban sakti hai (limit sirf camera pe 60s) | Kharcha aur ghalat content | Server validation: duration <= 60s |
| Retry pe nayi `uuid` | Ek video do baar | Ek `videoId`, retry pe sirf nayi link |
| Do regions (upload `eu-central-1`, list `us-east-1`) | Confusion, latency | Sab kuch ek region mein |

---

## 3. Sawal 1: Lambda functions ya apna server?

Dono possible hain. Pehle yeh samjho: **API** (login ke baad requests handle karna) aur **video processing** (ffmpeg) do alag kaam hain. Video processing kisi bhi surat mein API request ke andar nahi hoti, na server pe na Lambda pe.

### API ke liye options

| | Serverless (API Gateway + Lambda) | Server (ECS Fargate / EC2 + Express/NestJS) |
| --- | --- | --- |
| Setup | Aasan | Zyada (container, load balancer, scaling) |
| Kharcha shuru mein | Bohat kam (jitna use utna) | Hamesha chalta rehta hai |
| Traffic achanak barhe | Khud scale | Scaling rules banane parte hain |
| Maintenance | AWS sambhalta hai | OS, patches, deployments aap |
| Cold start | Hota hai (CRUD APIs ke liye aam taur pe theek) | Nahi |
| Lambda ki limits | 15 min timeout, request/response size limits | Aisi limits nahi |
| WebSocket / long connection | Possible lekin alag setup | Aasan |
| Team ka experience | Event-driven sochna parta hai | Purani tarah ka backend |

### Meri recommendation

**Serverless-first**:

- API: **API Gateway** + **Lambda**
- Data: **DynamoDB**
- Files: **S3**
- Pipeline: **EventBridge + Step Functions**
- Heavy ffmpeg (agar Lambda ki limits kam parein): **ECS Fargate task** ya **AWS Batch**

Wajah: shorts app ka traffic upar neeche hota hai, team chhoti hai, aur video ka kaam waise bhi events pe chalta hai.

Server (Fargate) tab sochna jab: traffic hamesha zyada ho (kharcha barabar ho jaye), long-lived connections chahiye, ya team ko Express/NestJS ka acha experience ho.

### API Gateway: HTTP API ya REST API?

- **HTTP API**: sasta, simple, JWT authorizer built-in. WAF seedha attach nahi hota.
- **REST API**: mehnga, lekin WAF, usage plans, request validation milte hain.

Shuru mein HTTP API theek hai. Baad mein WAF chahiye to CloudFront aage laga kar uspe WAF lagate hain.

### Lambda Function URL kyun nahi?

Function URL ka auth sirf `NONE` (koi bhi) ya `AWS_IAM` hota hai. JWT login ka built-in support nahi, aur throttling jaisi cheezein bhi nahi. POC ke liye ok, production ke liye API Gateway.

---

## 4. Sawal 2: Authentication kaise chalegi agar "server" nahi banate?

Pehle ek galat fehmi door karo: authentication ka matlab "mera server" nahi. Server hone ya na hone se farq nahi parta. Login ka kaam **identity provider** karta hai (Cognito, Auth0, Firebase Auth, Clerk). Apna password system banana (hashing, reset, MFA, lockout) khatarnak aur mehnga hai. **Mat banao.**

### Flow (Cognito ke saath)

```
1. User sign up / sign in  ──► Cognito User Pool
2. Cognito deta hai:  ID token, Access token, Refresh token   (teeno JWT/tokens)
3. App tokens ko expo-secure-store mein rakhti hai
4. Har API call:   Authorization: Bearer <accessToken>
5. API Gateway ka JWT authorizer token check karta hai
      (signature, expiry, issuer, audience) - koi Lambda code nahi likhna
6. Lambda ko milta hai:  event.requestContext.authorizer.jwt.claims.sub   (user ki ID)
7. Lambda ownership check karta hai (sirf apni video delete/dekh sakta hai)
8. Access token expire ho to app refresh token se naya le leti hai
```

Points:

- **`sub`** user ki permanent ID hai. Isi ko `ownerId` bana kar DB mein rakho.
- S3 ka access app ko seedha nahi dete. App sirf **presigned URL** leti hai, aur woh bhi tab jab login ho.
- Admin/moderator: Cognito **Groups** use karo. Token mein `cognito:groups` claim aata hai.
- Google/Apple login: Cognito se federate ho sakta hai. iOS pe agar doosre social logins hon to Apple ki guidelines (Sign in with Apple) dekhna.
- Expo mein Cognito use karne ka tareeqa (Amplify, `expo-auth-session` + Hosted UI) Expo SDK 57 ke docs se dekh kar karenge. Yeh guide us ka code nahi deta.

### Auth ke teen dar

| Qadam | Kaun karta hai |
| --- | --- |
| Authentication (tum kaun ho) | Cognito + API Gateway authorizer |
| Authorization (tum kya kar sakte ho) | Lambda code (`ownerId === sub`) |
| Data access (S3/DB) | IAM roles (har Lambda ka apna role, sirf zaroori permissions) |

---

## 5. Poora architecture

```
                         ┌───────────────────────────────────────────────┐
                         │                  Mobile App                   │
                         └───────────────────────────────────────────────┘
   1. POST /videos (JWT)   │            │ 2. PUT file (progress 0-100%)        ▲ 6. play (HLS)
                           ▼            ▼                                      │
                   ┌──────────────┐  ┌──────────────────┐             ┌───────────────┐
                   │ API Gateway  │  │  S3  RAW bucket  │             │  CloudFront   │
                   │ + JWT auth   │  │  (private)       │             │  (CDN)        │
                   └──────┬───────┘  └────────┬─────────┘             └───────▲───────┘
                          ▼                   │ ObjectCreated event           │
                   ┌──────────────┐           ▼                       ┌───────┴───────┐
                   │ Lambda       │     ┌─────────────┐               │ S3 MEDIA      │
                   │ createVideo  │     │ EventBridge │               │ bucket        │
                   └──────┬───────┘     └──────┬──────┘               │ (private)     │
                          │                    ▼                      └───────▲───────┘
                          │          ┌───────────────────┐                    │
                          ▼          │  Step Functions   │                    │
                   ┌──────────────┐  │  "ProcessVideo"   │                    │
                   │  DynamoDB    │◄─┤  1 Validate       │────────────────────┤
                   │  (videos)    │  │  2 Thumbnail      │  (ffmpeg Lambda)   │
                   └──────▲───────┘  │  3 Transcode ─────┼──► MediaConvert ───┘
                          │          │  4 (Moderation)   │
   3. GET /videos/{id}    │          │  5 Mark READY /   │
      (polling)           │          │    FAILED         │
                          │          └─────────┬─────────┘
                          │                    ▼
                          │             ┌─────────────┐   7. Push notification
                          └─────────────┤ EventBridge ├──────────────────────────► App
                                        │ VideoReady  │   (Expo Push / FCM / APNs)
                                        └─────────────┘
```

### AWS services aur unka maqsad

**Day 1 (lazmi):**

| Service | Maqsad | Is project mein |
| --- | --- | --- |
| **Cognito** | User login, signup, tokens | Auth |
| **API Gateway** | App ka darwaza: auth check, routing, throttling | `/videos`, `/videos/{id}` |
| **Lambda** | Chhota business code | createVideo, listVideos, getVideo, processVideo |
| **DynamoDB** | Video ka data (title, status, owner...) | `Videos` table |
| **S3** | Video aur thumbnail files | `raw` (upload) aur `media` (processed) buckets |
| **IAM** | Permissions | Har Lambda ka alag role |
| **CloudWatch** | Logs, metrics, alarms | Monitoring |

**Jaldi chahiye (Phase 2):**

| Service | Maqsad | Is project mein |
| --- | --- | --- |
| **EventBridge** | Events ko sahi jagah bhejna (upload hui, video ready) | S3 event se pipeline shuru, `VideoReady` event |
| **Step Functions** | Pipeline ke steps ek order mein, retries aur failure handling ke saath | `ProcessVideo` state machine |
| **MediaConvert** | Managed transcoding: HLS, kayi quality, JPEG frame | Shorts HLS |
| **CloudFront** | CDN: video paas ke server se tez chale, S3 private rahe | Playback |
| **SQS + DLQ** | Jo kaam fail ho, woh queue mein mehfooz rahe | Failed events |
| **SNS / Expo Push** | Phone pe notification | Video ready |
| **SSM Parameter Store / Secrets Manager** | Config aur secrets | API keys, bucket names |

**Baad mein / optional:**

| Service | Maqsad |
| --- | --- |
| **Rekognition (Video)** | Content moderation (ghalat content pakarna) |
| **WAF** | Bots aur abuse se bachao |
| **Route 53 + ACM** | Apna domain aur HTTPS certificate |
| **X-Ray** | Request tracing |
| **KMS** | Apni encryption keys (S3 ki default encryption pehle se hoti hai) |
| **AWS Budgets** | Kharcha limit alarm |
| **CDK / SAM / Terraform** | Infrastructure ko code mein likhna (IaC) |
| **AWS Organizations** | dev/stage/prod ke alag accounts |

---

## 6. Video upload se READY tak: step by step

### Video ki states (status)

```
PENDING_UPLOAD ──► PROCESSING ──► READY
       │                │
       │                └──────► FAILED   (ghalat file, lambi video, error)
       └──► (24 ghante mein upload nahi hui to DynamoDB TTL se item delete)
```

### Step 1: Record banao aur upload link lo (`POST /videos`)

App bhejti hai (login token ke saath):

```json
{
  "title": "Cover drive",
  "seriesId": "ashes",
  "contentType": "video/mp4",
  "sizeBytes": 9820013
}
```

Lambda:

1. `sub` se `ownerId` leta hai.
2. Check karta hai: title, type (`video/mp4`, `video/quicktime`), size <= limit.
3. `videoId` (uuid) banata hai.
4. DynamoDB mein item likhta hai, status `PENDING_UPLOAD`.
5. Key banata hai: `raw/{ownerId}/{videoId}/original.mp4` (file name key mein nahi).
6. Presigned PUT URL (15 minute) deta hai.

Jawab:

```json
{ "videoId": "7f0c...", "uploadUrl": "https://...", "expiresIn": 900 }
```

Is se title/category pehle hi DB mein aa gayi, aur retry pe naya record nahi banta (agar upload fail ho to app dobara `POST /videos/{id}/upload-url` jaisa endpoint laga kar usi `videoId` ki nayi link le sakti hai).

### Step 2: Client S3 pe upload karti hai

`PUT` seedha S3 pe. Progress 0-100% app mein. Backend is mein shamil nahi.

### Step 3: Backend ko kaise pata chalta hai ke upload ho gayi?

**Client se "ho gayi" bolne par bharosa nahi karte.** S3 khud event bhejta hai:

- S3 bucket pe "EventBridge notifications" on karo.
- Jab `raw/...` mein file ban jati hai, event `Object Created` EventBridge pe aata hai.
- EventBridge ka rule `ProcessVideo` Step Function shuru karta hai.

Key se `ownerId` aur `videoId` nikal lete hain (isliye key ka format fixed rakha).

Optional: app `POST /videos/{id}/complete` bhi bhej sakti hai, lekin yeh sirf ishara hai. Asal sach S3 ka event hai.

### Step 4: Pipeline (Step Functions)

```
Validate ──► Thumbnail ──► Transcode ──► (Moderation) ──► MarkReady
   │            │             │               │
   └────────────┴─────────────┴───────────────┴──► (koi bhi fail) ──► MarkFailed
```

| Step | Kya hota hai | Tool |
| --- | --- | --- |
| Validate | File asal mein video hai? Duration <= 60s? Size theek? (client ki di hui type/size pe bharosa nahi, real file check karte hain) | Lambda + ffprobe |
| Thumbnail | 2nd second ka frame JPEG | Lambda + ffmpeg (ya MediaConvert) |
| Transcode | Standard H.264/AAC, HLS (kayi quality) | MediaConvert (production) |
| Moderation | Ghalat content check | Rekognition (optional) |
| MarkReady | DB mein `READY`, playback URLs | Lambda |
| MarkFailed | DB mein `FAILED` + wajah | Lambda |

Step Functions ke fayde: har step ke **retry**, **timeout**, **error handling**, aur console mein dikhta hai ke video kis step pe atki. Chhote POC ke liye S3 se seedha ek Lambda bhi chal jata hai (Section 15 ka example yehi karta hai).

Step Functions ka sketch (sirf shape, poora ASL nahi):

```json
{
  "StartAt": "Validate",
  "States": {
    "Validate":   { "Type": "Task", "Resource": "arn:aws:states:::lambda:invoke", "Next": "Thumbnail",
                    "Retry": [{ "ErrorEquals": ["States.TaskFailed"], "MaxAttempts": 2 }],
                    "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "MarkFailed" }] },
    "Thumbnail":  { "Type": "Task", "Resource": "arn:aws:states:::lambda:invoke", "Next": "Transcode",
                    "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "MarkFailed" }] },
    "Transcode":  { "Type": "Task", "Resource": "arn:aws:states:::mediaconvert:createJob.sync", "Next": "MarkReady",
                    "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "MarkFailed" }] },
    "MarkReady":  { "Type": "Task", "Resource": "arn:aws:states:::lambda:invoke", "End": true },
    "MarkFailed": { "Type": "Task", "Resource": "arn:aws:states:::lambda:invoke", "End": true }
  }
}
```

(`...` jagah `Parameters` bhi likhne hote hain. IAM role aur MediaConvert settings CDK/console se banate hain.)

---

## 7. Database: data kaise store hoga

### DB ki zaroorat kyun hai?

S3 sirf **files** rakhta hai. Woh yeh nahi bata sakta ke "Ashes ki sab se nayi 2 videos kaun si hain", "yeh video kis user ki hai", ya "yeh abhi processing mein hai ya ready". Isliye video S3 mein jati hai, aur uske baare mein jo cheezein hain (title, category, status, owner, thumbnail ka path) woh database mein.

### DynamoDB kya hai (bilkul shuru se)

DynamoDB AWS ka database hai. Ise ek bahut bari **dictionary** samjho: aap ek key dete ho, woh foran uska data de deta hai.

| Lafz | Matlab | Hamare app mein |
| --- | --- | --- |
| **Table** | Folder jaisa, ek qism ka data | `Videos` |
| **Item** | Ek record (SQL ki row jaisa) | Ek video |
| **Attribute** | Item ki fields | `title`, `status`, `seriesId` |
| **Partition key** | Woh key jis se item dhoondha jata hai | `videoId` |
| **Sort key** (optional) | Ek key ke andar items ki tarteeb | `createdAt` |
| **GSI (index)** | Item ko doosre tareeqe se dhoondhne ka rasta | `feed` (series ke hisaab se latest) |

Is mein koi server nahi hota. Na patching, na connection ka masla. Aap bas Lambda se read/write karte ho.

SQL mein hum likhte:

```sql
SELECT * FROM videos WHERE series = 'ashes' ORDER BY created_at DESC LIMIT 2;
```

DynamoDB mein yehi hota hai: `feed` index pe `feedPk = "SERIES#ashes"`, naye pehle (`ScanIndexForward: false`), `Limit: 2`. Farq yeh hai ke jo sawal poochne hain unke liye table pehle se isi hisaab se banani parti hai.

**Aam seedhi baatein:**

- Joins nahi hote.
- Har sawal ke liye pehle se index sochna parta hai.
- `Scan` poori table parhta hai, isse bachna hota hai.
- Ek item ki limit 400 KB hai.
- Kharcha jitni requests utna. Chhote POC mein bohat kam, lekin AWS pricing page zaroor dekhna.

### Humare liye DynamoDB kyun sahi hai

1. **Lambda ke saath asaan.** SQL database ke saath har Lambda apna connection kholta hai. Bohat Lambdas chalein to database par connections ka bojh pad jata hai (is liye RDS Proxy lagana parta hai). DynamoDB mein yeh masla nahi.
2. **Password nahi.** Lambda ke IAM role se hi access milta hai, DB password manage nahi karna parta.
3. **Server nahi sambhalna.** Scale, backup, multi-AZ AWS sambhalta hai.
4. **Hamare sawal simple hain:** id se video, series ki latest videos, user ki apni videos. Yeh sab DynamoDB ko pasand hain.

### Relational DB (PostgreSQL / MySQL) ya MongoDB kab?

**Relational (Aurora / RDS pe PostgreSQL ya MySQL):** table ki fixed shape, joins, transactions, constraints.

| Fayda | Nuksan |
| --- | --- |
| Complex relations (user, follow, like, comment) aasan | Lambda ke saath connection masla (RDS Proxy chahiye) |
| Naye sawal baad mein bhi SQL se poochh sakte ho | DB hamesha chalta hai, kharcha |
| Reports aur analytics aasan | Schema badalna (migrations) |
| Zyada developers SQL jante hain | Bohat bade write load par scale mushkil |

**MongoDB:** JSON jaise documents, schema flexible, queries bohat lachakdar.

- **MongoDB Atlas:** asli MongoDB, alag company ki service hai, AWS ke andar chal sakti hai. Alag billing aur network setup.
- **Amazon DocumentDB:** AWS ka MongoDB-compatible database. Yeh asli MongoDB nahi, kuch features alag ya kam hain, aur instances chalte rehte hain.

Fayda: agar team Mongo/Mongoose jaanti hai aur flexible queries chahiye. Nuksan: ek aur service ka bojh, Lambda ke connections ka khayal, aur kharcha.

**Teeno ka seedha muqabla:**

| | DynamoDB | PostgreSQL (Aurora/RDS) | MongoDB (Atlas/DocumentDB) |
| --- | --- | --- | --- |
| Server sambhalna | Nahi | Kam (managed), lekin DB hamesha chalta hai | Atlas managed, DocumentDB instances |
| Lambda ke saath | Bohat acha | Connection pool ka khayal (RDS Proxy) | Connection reuse ka khayal |
| Naye sawal poochna | Mushkil (index pehle chahiye) | Aasan (SQL) | Aasan (queries/aggregation) |
| Joins | Nahi | Haan | Limited |
| Scale | Bohat bada, khud | Upar tak, mehnat se | Cluster ke saath |
| Seekhne mein | Key design naya lagta hai | Sab se aam | Developers ko asaan lagta hai |
| Vendor | AWS only | Open standard (kahin bhi chal sakta hai) | Atlas (alag vendor) / AWS |

**Mera faisla:**

| Zaroorat | Choice |
| --- | --- |
| **Abhi (video metadata, feed, status)** | **DynamoDB** |
| Baad mein follow, likes, comments, search, reports | PostgreSQL (Aurora) **bhi jor do** |
| Team sirf SQL jaanti hai aur DynamoDB seekhna nahi chahti | Shuru se PostgreSQL |
| Team Mongo jaanti hai, AWS-native hona zaroori nahi | MongoDB Atlas |

Dono saath chalna aam hai: video ka data DynamoDB mein, social cheezein PostgreSQL mein. Shuru mein ek hi DB rakhna aasan hai.

Seedhi baat: yahan "ek sahi jawab" nahi hota. DynamoDB ka khatra yeh hai ke naya sawal aaye jo index mein nahi, to table ka design badalna parta hai. SQL mein yeh aasan hota hai. Hamare video feed ke liye woh khatra kam hai, is liye DynamoDB theek hai.

### Kaunsa DB? (faisla)

**DynamoDB** (serverless, scale ke saath kharcha barhta hai, Lambda ke saath best). Agar kal ko bohat complex relations (follow, comments, likes ke complex reports) chahiye hon to Aurora PostgreSQL alag se jor sakte ho. Video metadata ke liye DynamoDB kaafi hai.

Note: Agar tumhara **server aur uska DB pehle se hai**, to video ka data usi DB mein rakho aur DynamoDB ki zaroorat nahi (Section 19). Yeh Section DynamoDB ko tab samjhata hai jab backend naya ho.

Rule: **file S3 mein, data DynamoDB mein.** DB mein sirf S3 keys rakho, poora URL nahi (domain kal badal sakta hai).

### Table: `Videos`

Primary key: `videoId` (string).

Ek item (READY ke baad):

```json
{
  "videoId": "7f0c1b2e-3a4d-4c5e-9f10-aabbccddeeff",
  "ownerId": "a1b2c3d4-... (Cognito sub)",
  "title": "Cover drive",
  "seriesId": "ashes",
  "status": "READY",
  "rawKey": "raw/a1b2.../7f0c.../original.mp4",
  "hlsKey": "hls/7f0c.../index.m3u8",
  "thumbKey": "thumbs/7f0c.../thumb.jpg",
  "contentType": "video/mp4",
  "sizeBytes": 9820013,
  "durationSec": 23.4,
  "width": 1080,
  "height": 1920,
  "feedPk": "SERIES#ashes",
  "createdAt": "2026-10-19T02:00:00.000Z",
  "updatedAt": "2026-10-19T02:00:41.000Z"
}
```

Upload hone se pehle (`PENDING_UPLOAD`) item mein `expiresAt` (unix seconds) hota hai. DynamoDB **TTL** us attribute pe on karo, to jo video kabhi upload nahi hui woh khud delete ho jati hai. `READY` hone par `expiresAt` hata dete hain.

### Indexes (GSI)

| Index | PK | SK | Kis kaam ke liye |
| --- | --- | --- | --- |
| `byOwner` | `ownerId` | `createdAt` | "Meri uploads" (profile) |
| `feed` | `feedPk` | `createdAt` | Home: series ke latest videos |

`feed` ek **sparse index** hai: `feedPk` sirf tab set hota hai jab video `READY` ho. Is liye `PENDING`/`FAILED` videos feed mein aate hi nahi. Koi `if status == READY` filter nahi likhna parta.

Kuch dusre sawal, jawab:

- *Home pe har series ki 2 latest videos?* Har series ke liye `feed` index pe `Limit: 2`, descending (`ScanIndexForward: false`). 4 series = 4 chhoti queries.
- *Pagination?* DynamoDB `LastEvaluatedKey` deta hai. Isko base64 kar ke `nextToken` bana kar app ko do (jaise hamari list API mein abhi hai).
- *Sab series ka ek hi "latest" feed?* Ek `feedPk = "ALL"` poora traffic ek partition pe daalta hai. Bohat bade scale pe alag tareeqa (sharding) chahiye. Shuru mein series-wise feed rakho.

### Dusri tables (jab zaroorat ho)

- `Users`: PK `userId` (= Cognito `sub`), display name, avatar, push token(s).
- `Series`: agar categories admin se badalni hon (abhi `constants/series.ts` mein hain).

### Ab jo S3 listing se hota hai, woh kyun nahi chalega?

`ListObjectsV2` sirf file names deta hai: category nahi, status nahi, sorting nahi, 1000 files ke baad sust. DB ke baghair shorts feed nahi banta.

---

## 8. ffmpeg: kahan aur kaise chalayen

### ffmpeg kya hai?

Ek command line tool jo video/audio ko padhta, badalta, aur frames nikalta hai. Ye kaam karta hai:

- Thumbnail: video ka ek frame JPEG banana
- Transcode: video ko standard format (H.264 + AAC) mein badalna
- HLS: video ko chhote tukron (segments) mein todna jo streaming ke liye hote hain

### ffmpeg kahan chal sakta hai

| Jagah | Limits / Notes | Shorts (<= 60s) ke liye |
| --- | --- | --- |
| **Lambda** (layer ya container image) | 15 min timeout, max 10,240 MB memory, `/tmp` max 10 GB, GPU nahi | Theek (probe, thumbnail, chhota transcode) |
| **ECS Fargate task** | Aisi limits nahi, chalne ke ghante ka kharcha | Jab Lambda kam pare |
| **AWS Batch** | Bohat saari jobs queue mein | Bade volume ke liye |
| **EC2** | Aap sambhalte ho | Sab se mushkil |
| **MediaConvert** | ffmpeg nahi, AWS ka managed transcoder | **Production transcoding ke liye behtar** |

### Meri recommendation

- **Phase 1**: Lambda + ffmpeg se **ffprobe (validate) + thumbnail**. Yeh kaafi chhota aur sasta hai.
- **Phase 2**: **MediaConvert** se HLS (kayi quality). Yeh ready, scalable, aur ffmpeg ke license wale masle se bhi bachata hai. (Kuch static ffmpeg builds `libx264` ke saath GPL license mein hoti hain. Commercial app mein pehle legal check karo.)

### ffmpeg ko Lambda mein kaise lagayen

1. Linux ke liye **static ffmpeg build** lo. Architecture Lambda ke saath mel khaye (`arm64` Graviton sasta hota hai, ya `x86_64`).
2. Zip aisa banao:

```
ffmpeg-layer.zip
└── bin/
    ├── ffmpeg
    └── ffprobe
```

3. Layer publish karo:

```
aws lambda publish-layer-version --layer-name ffmpeg --zip-file fileb://ffmpeg-layer.zip --compatible-runtimes nodejs20.x --compatible-architectures arm64
```

4. Function mein layer jodo. Lambda layers `/opt` mein khulti hain, to commands ye hongi: `/opt/bin/ffmpeg` aur `/opt/bin/ffprobe`.
5. Function ki **memory 1024-3008 MB** rakho (zyada memory = zyada CPU), **timeout** 1-5 minute, aur **ephemeral storage** thora zyada.

Layer ki size limit hoti hai (unzipped total 250 MB). Production mein **container image** Lambda zyada saaf hai (versions pinned hote hain).

### Commands jo laptop pe pehle chala kar dekho

Windows pe ffmpeg install kar ke (gyan.dev ya koi static build) pehle laptop pe test karo. Is se Lambda ka masla alag, ffmpeg ka masla alag samajh aata hai.

Video ki maloomat (duration, size, rotation):

```
ffprobe -v error -print_format json -show_format -show_streams input.mp4
```

Thumbnail (2nd second, 720 wide, aspect barkarar):

```
ffmpeg -y -ss 2 -i input.mp4 -frames:v 1 -vf "scale='min(720,iw)':-2" -q:v 3 thumb.jpg
```

`-ss` ko `-i` se **pehle** likhne se tez seek hota hai.

Agar video 2 second se chhoti ho to `-ss` ko `min(2, duration/2)` karo (example code mein hai).

Standard MP4 (H.264 + AAC, phone pe sab jagah chalne wali, jaldi start):

```
ffmpeg -i input.mov -c:v libx264 -preset veryfast -crf 23 -vf "scale='min(720,iw)':-2" -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart output.mp4
```

HLS (ek quality, 4 second ke segments):

```
ffmpeg -i input.mp4 -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename "seg_%03d.ts" index.m3u8
```

Kayi qualities (1080p, 720p, 480p) ka ek playlist (ABR) ffmpeg mein mushkil hai. MediaConvert yeh asaan kar deta hai.

### Aam ghaltiyan

- iPhone ki video **rotation metadata** ke saath aati hai (width/height ulta lagta hai). ffmpeg khud autorotate karta hai, lekin `ffprobe` ke numbers dekh kar apni hisab kitab na karo.
- iPhone **HEVC (H.265)** video bhejta hai. Purane Android phones pe nahi chalti. Transcode se H.264 banao.
- `-pix_fmt yuv420p` bhoolo to kuch players video nahi dikhate.
- `/tmp` Lambda mein reuse hota hai. Kaam ke baad temp files delete karo.

---

## 9. Client: 0-100% ke baad user ko kya dikhayen

**Pehla usool:** progress bar 100% hone ka matlab "upload hui". Iska matlab "video tayyar" nahi. Server abhi kaam kar raha hai.

### Screen ki states

| Status | User ko kya dikhao |
| --- | --- |
| Upload ho rahi hai | Progress bar 0-100% (jaisa abhi hai) |
| Upload 100% | "Upload complete. We're preparing your video." (spinner). User ko screen chhorne do. |
| `PROCESSING` | "My uploads" mein video ka card: local thumbnail (jo phone ne nikali thi) + "Processing..." |
| `READY` | Card normal ho jaye, home/feed mein dikhe. Toast: "Your video is live." |
| `FAILED` | Wajah (e.g. "Video is longer than 60 seconds") + Retry button |
| Zyada der lag jaye (jaise 5 min) | "This is taking longer than usual. We'll notify you." |

Tareeqa: upload 100% hote hi app **foran navigate** kar sakti hai (Home ya My uploads pe), aur video ka card local frame ke saath dikhaye. Is se user ko lagta hai kaam ho gaya, jabke background mein processing chal rahi hai. Isko **optimistic UI** kehte hain.

### Agar upload beech mein toot jaye

- Presigned link 15 minute ki hoti hai. Link expire ho gayi to app usi `videoId` ki **nayi link** le.
- App band ho gayi: iOS pe `expo-file-system` mein background upload ka option hai (docs mein `sessionType`). Android pe kaam alag hota hai, implement karte waqt docs dekhna.
- Wi-Fi only option, ya data par warning dena achi cheez hai.

---

## 10. Notify kaise karen (do alag sawal)

**A) Backend ko kaise pata chale ke video upload ho gayi?**
S3 ka `Object Created` event (Section 6, Step 3). Client ko bataane ki zaroorat nahi.

**B) User/app ko kaise pata chale ke video tayyar hai?**

| Tareeqa | Kaise | Fayda | Nuksan |
| --- | --- | --- | --- |
| **Polling** | App `GET /videos/{id}` har 3 second | Sab se aasan, extra service nahi | Thora network use |
| **Push notification** | Video `READY` hone par server push bheje | App band ho tab bhi pata chale | Token manage karna parta hai |
| **WebSocket / AppSync subscription** | Server seedha app ko batata hai | Live | Setup zyada |

**Recommendation:**

- **Phase 1**: Polling. Pehle 30 second har 3 second, phir 10 second.
- **Phase 2**: Push notification. App apna **Expo push token** `Users` table mein save kare. Jab `VideoReady` event aaye to notification Lambda us user ko push bheje.

Pipeline ke aakhir mein `MarkReady` Lambda EventBridge pe event daalta hai:

```json
{ "source": "kingsmen.videos", "detail-type": "VideoReady", "detail": { "videoId": "7f0c...", "ownerId": "a1b2..." } }
```

Is se push, analytics, search index sab alag alag subscribers bante hain. Pipeline ka code badalna nahi parta.

Polling React Query ke saath:

```ts
const video = useQuery({
  queryKey: ['video', videoId],
  queryFn: () => api.get(`/videos/${videoId}`),
  refetchInterval: (query) =>
    ['READY', 'FAILED'].includes(query.state.data?.status) ? false : 3000,
});
```

---

## 11. Playback aur delivery

- **Buckets private.** "Block Public Access" on.
- App ko URL **CloudFront** ka milta hai. CloudFront ko S3 tak **Origin Access Control (OAC)** se access dete hain (S3 sirf CloudFront ko jawab dega).
- Agar video private/paid ho to **CloudFront signed URLs/cookies** use karo.
- Thumbnail pe lamba cache lagao (`Cache-Control: public, max-age=31536000, immutable`). Naam `thumbs/{videoId}/thumb.jpg` kabhi nahi badalta, isliye ye safe hai.

### Shorts feed ke liye

- Format: **HLS** (`.m3u8`). `expo-video` HLS support karta hai (docs mein source ka `contentType` option hai). Implement karte waqt docs dekhna.
- Segments chhote (2-4 second), ek ya do quality, video **faststart**.
- Feed: ek waqt mein sirf 2-3 players mounted. Baqi videos pe **thumbnail (poster)** dikhao, jaise humne details screen par kiya. Isi se "video load hone se pehle pehla frame dikhao" wala sawal hal hota hai.
- Thumbnail ratio video jaisi (9:16) rakho (720x1280 JPEG, ~50-100 KB).

---

## 12. Security checklist

- [ ] Har API pe login (JWT authorizer). Sirf `GET` feed public ho to bhi rate limit lagao.
- [ ] Ownership check: user sirf apni video `DELETE`/`GET` kare.
- [ ] S3 buckets private, Block Public Access on, default encryption on.
- [ ] `raw` aur `media` buckets **alag**.
- [ ] Key server banata hai, user ka file name key mein nahi.
- [ ] Presigned URL ki expiry chhoti (15 min). Nayi link sirf login ke baad.
- [ ] Client ki di hui `contentType`/size pe bharosa nahi. Humne apni presigned URL mein dekha ke `SignedHeaders=host` tha, yaani `Content-Type` sign nahi hota. Isliye asli file ffprobe se check karo.
- [ ] Size limit: presigned **PUT** pe size ki hard limit nahi hoti. Options: (1) pipeline mein `HeadObject` se size dekh kar bari file delete karo, (2) presigned **POST** (`content-length-range` condition). POST mein `file` field aakhri hona chahiye. `expo-file-system` multipart ke saath yeh pehle test karo.
- [ ] Har Lambda ka alag IAM role, sirf zaroori permissions (Section 15 mein example).
- [ ] Throttling aur WAF (bots se bachao). Har user ki daily upload limit.
- [ ] Secrets code mein nahi. SSM Parameter Store ya Secrets Manager.
- [ ] Tokens `expo-secure-store` mein, kabhi `AsyncStorage` ya logs mein nahi.
- [ ] S3 lifecycle: adhoori multipart uploads 1 din mein abort. `raw` file kuch din baad delete ya sasti storage mein.
- [ ] Moderation (Rekognition) agar user generated content public ho.
- [ ] Privacy: user apna account/video delete kar sake. App Store/Play Store ke rules dekho.

Ek chhoti baat: naye AWS SDK v3 versions presigned URL mein checksum parameter daalte hain. Agar kabhi upload par `BadDigest` jaisa error aaye to S3Client banate waqt `requestChecksumCalculation: "WHEN_REQUIRED"` laga kar dekho.

---

## 13. Reliability: jab cheezein fail hon

- **Idempotency**: S3 events kabhi kabhi dobara aa sakte hain. Pipeline ko aisa likho ke dobara chalne se nuksan na ho. Example code mein status ko `PENDING_UPLOAD -> PROCESSING` conditional update se claim karte hain.
- **Retries**: Step Functions mein har step pe retry (2-3 baar, backoff ke saath).
- **DLQ**: jo events baar baar fail hon, SQS Dead Letter Queue mein jaayen, ke ghayab na hon.
- **Alarms** (CloudWatch): failed Step Function executions, Lambda errors, DLQ mein messages, API 5xx, MediaConvert job errors.
- **Alert ka raasta**: SNS se email/Slack.
- **Logs**: JSON logs mein `videoId` hamesha likho, taake ek video ki poori kahani dhoondh sako.
- **Timeouts**: har step ka timeout lagao, warna atki hui job paise khati rehti hai.

---

## 14. Environments, IaC, CI/CD, kharcha

- **3 environments**: dev, staging, prod. Behtar: har ek ka alag AWS account (AWS Organizations).
- **Infrastructure as Code**: AWS **CDK** (TypeScript, hamari team ki zubaan) ya SAM. Console mein click karke banai hui cheez dobara nahi banti.
- **CI/CD**: GitHub Actions se deploy. AWS ke saath **OIDC** (lambi umar ki access keys repo mein nahi).
- **Ek region**: sab kuch ek hi region mein (abhi dono regions mix hain).
- **Kharcha**:
  - Sab se zyada kharcha aam taur pe: CloudFront/S3 data out, MediaConvert minutes, Lambda GB-seconds.
  - AWS Budgets alarm lagao.
  - Current prices AWS Pricing Calculator se dekho. Mujhse yaad ke numbers mat lo, badalte rehte hain.
  - Sasta rakhne ke tareeqe: lifecycle rules, 60 second ki hard limit, thumbnail chhota rakhna, sirf zaroori qualities.
- **Mobile**: app version check, upload retry, aur ek "force update" mechanism.

### Backend repo ka structure (suggestion)

```
backend/
  infra/                  (CDK)
  src/
    functions/
      createVideo.mjs
      getVideo.mjs
      listVideos.mjs
      processVideo.mjs    (ffmpeg)
      markReady.mjs
    lib/
      http.mjs            (json() helper)
      db.mjs              (DynamoDB client)
```

---

## 15. Code examples

Yeh reference ke liye hain. Naam, bucket, table env variables se aate hain. Dev account mein test karo.

### 15.1 `createVideo` (login ke baad upload link)

```js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const RAW_BUCKET = process.env.RAW_BUCKET;
const TABLE = process.env.TABLE_NAME;
const MAX_BYTES = 200 * 1024 * 1024;
const EXT_BY_TYPE = { "video/mp4": "mp4", "video/quicktime": "mov" };
const SERIES_IDS = new Set(["ashes", "bgt", "world-cup", "others"]);

export const handler = async (event) => {
  // API Gateway ka JWT authorizer pehle hi token check kar chuka hota hai
  const ownerId = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!ownerId) return json(401, { message: "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { message: "Body must be JSON" });
  }

  const title = String(body.title || "").trim().slice(0, 100);
  const contentType = String(body.contentType || "").trim().toLowerCase();
  const sizeBytes = Number(body.sizeBytes);
  const seriesId = SERIES_IDS.has(body.seriesId) ? body.seriesId : "others";
  const ext = EXT_BY_TYPE[contentType];

  if (!title) return json(400, { message: "title is required" });
  if (!ext) return json(400, { message: "Unsupported contentType" });
  if (!(sizeBytes > 0 && sizeBytes <= MAX_BYTES)) {
    return json(400, { message: "Invalid file size" });
  }

  const videoId = randomUUID();
  const rawKey = `raw/${ownerId}/${videoId}/original.${ext}`;
  const now = new Date().toISOString();

  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        videoId,
        ownerId,
        title,
        seriesId,
        status: "PENDING_UPLOAD",
        rawKey,
        contentType,
        sizeBytes,
        createdAt: now,
        updatedAt: now,
        expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // DynamoDB TTL
      },
      ConditionExpression: "attribute_not_exists(videoId)",
    }),
  );

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: RAW_BUCKET, Key: rawKey, ContentType: contentType }),
    { expiresIn: 900 },
  );

  return json(201, { videoId, uploadUrl, expiresIn: 900 });
};

function json(statusCode, payload) {
  return { statusCode, body: JSON.stringify(payload) };
}
```

### 15.2 `processVideo` (S3 se chalta hai: validate, thumbnail, ready)

Yeh POC version hai: S3 event direct Lambda ko bulata hai. Production mein yehi kaam Step Functions ke alag steps ban jata hai.

```js
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const s3 = new S3Client({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const TABLE = process.env.TABLE_NAME;
const FFMPEG = "/opt/bin/ffmpeg";
const FFPROBE = "/opt/bin/ffprobe";
const MAX_SECONDS = 61;

class ValidationError extends Error {}

export const handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const rawKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const [, , videoId] = rawKey.split("/"); // raw/{ownerId}/{videoId}/original.mp4
    await processOne({ bucket, rawKey, videoId });
  }
};

async function processOne({ bucket, rawKey, videoId }) {
  const inPath = `/tmp/${videoId}-in`;
  const thumbPath = `/tmp/${videoId}-thumb.jpg`;

  try {
    const item = await claim(videoId);
    if (!item) return; // duplicate event, kaam pehle hi ho chuka

    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: rawKey }));
    await pipeline(object.Body, createWriteStream(inPath));

    const probe = await run(FFPROBE, [
      "-v", "error", "-print_format", "json", "-show_format", "-show_streams", inPath,
    ]).catch(() => {
      throw new ValidationError("File is not a valid video");
    });

    const info = JSON.parse(probe.stdout);
    const stream = info.streams.find((s) => s.codec_type === "video");
    const duration = Number(info.format?.duration);
    if (!stream || !(duration > 0)) throw new ValidationError("File is not a valid video");
    if (duration > MAX_SECONDS) throw new ValidationError("Video is longer than 60 seconds");

    const at = Math.min(2, duration / 2);
    await run(FFMPEG, [
      "-y", "-ss", String(at), "-i", inPath,
      "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "3", thumbPath,
    ]);

    const thumbKey = `thumbs/${videoId}/thumb.jpg`;
    await s3.send(
      new PutObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: thumbKey,
        Body: await readFile(thumbPath),
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    await markReady(item, { thumbKey, duration, width: stream.width, height: stream.height });
  } catch (error) {
    console.error("processVideo failed", videoId, error);
    const message =
      error instanceof ValidationError ? error.message : "Processing failed. Please try again.";
    await markFailed(videoId, message);
  } finally {
    await rm(inPath, { force: true });
    await rm(thumbPath, { force: true });
  }
}

// PENDING_UPLOAD -> PROCESSING (sirf ek baar kamyab hota hai)
async function claim(videoId) {
  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { videoId },
        UpdateExpression: "SET #s = :processing, updatedAt = :now",
        ConditionExpression: "#s = :pending",
        ExpressionAttributeNames: { "#s": "status" }, // STATUS DynamoDB ka reserved word hai
        ExpressionAttributeValues: {
          ":processing": "PROCESSING",
          ":pending": "PENDING_UPLOAD",
          ":now": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return result.Attributes;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return null;
    throw error;
  }
}

async function markReady(item, { thumbKey, duration, width, height }) {
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { videoId: item.videoId },
      UpdateExpression:
        "SET #s = :ready, thumbKey = :thumb, durationSec = :d, width = :w, height = :h, " +
        "feedPk = :feed, updatedAt = :now REMOVE expiresAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":ready": "READY",
        ":thumb": thumbKey,
        ":d": Math.round(duration * 10) / 10,
        ":w": width,
        ":h": height,
        ":feed": `SERIES#${item.seriesId}`,
        ":now": new Date().toISOString(),
      },
    }),
  );
}

async function markFailed(videoId, message) {
  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { videoId },
      UpdateExpression: "SET #s = :failed, errorMessage = :m, updatedAt = :now REMOVE expiresAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":failed": "FAILED",
        ":m": message,
        ":now": new Date().toISOString(),
      },
    }),
  );
}
```

Dhyan: is POC version mein jab MediaConvert lagega, `READY` transcode ke **baad** set hoga, yahan nahi.

### 15.3 `listVideos` (home feed)

`GET /videos?seriesId=ashes&limit=2`

```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const CDN = process.env.CDN_BASE_URL; // https://dxxxxxxxx.cloudfront.net

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const seriesId = q.seriesId || "others";
  const limit = Math.min(Number(q.limit) || 10, 30);

  const result = await db.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "feed",
      KeyConditionExpression: "feedPk = :pk",
      ExpressionAttributeValues: { ":pk": `SERIES#${seriesId}` },
      ScanIndexForward: false, // naye pehle
      Limit: limit,
      ExclusiveStartKey: decodeToken(q.nextToken),
    }),
  );

  return json(200, {
    videos: (result.Items || []).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      seriesId: v.seriesId,
      durationSec: v.durationSec,
      width: v.width,
      height: v.height,
      thumbnailUrl: `${CDN}/${v.thumbKey}`,
      playbackUrl: v.hlsKey ? `${CDN}/${v.hlsKey}` : undefined,
      createdAt: v.createdAt,
    })),
    nextToken: result.LastEvaluatedKey ? encodeToken(result.LastEvaluatedKey) : null,
  });
};

function encodeToken(key) {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

function decodeToken(token) {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function json(statusCode, payload) {
  return { statusCode, body: JSON.stringify(payload) };
}
```

App ko jo JSON milta hai:

```json
{
  "videos": [
    {
      "videoId": "7f0c1b2e-...",
      "title": "Cover drive",
      "seriesId": "ashes",
      "durationSec": 23.4,
      "width": 1080,
      "height": 1920,
      "thumbnailUrl": "https://dxxxxxxxx.cloudfront.net/thumbs/7f0c.../thumb.jpg",
      "playbackUrl": "https://dxxxxxxxx.cloudfront.net/hls/7f0c.../index.m3u8",
      "createdAt": "2026-10-19T02:00:00.000Z"
    }
  ],
  "nextToken": null
}
```

### 15.4 IAM: `processVideo` ka role (sirf zaroori permissions)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::RAW_BUCKET/raw/*" },
    { "Effect": "Allow", "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::MEDIA_BUCKET/thumbs/*" },
    { "Effect": "Allow", "Action": "dynamodb:UpdateItem",
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/Videos" }
  ]
}
```

`createVideo` ko sirf `s3:PutObject` (`raw/*` pe) aur `dynamodb:PutItem` mile. Is se agar ek Lambda hack ho to nuksan chhota rehta hai.

### 15.5 App side: create, upload, poll

```ts
// 1. Backend se link lo (token ke saath)
const created = await api.post('/videos', {
  title,
  seriesId,
  contentType,
  sizeBytes: asset.fileSize,
});

// 2. S3 pe upload (jaisa abhi hum karte hain, progress ke saath)
await new File(uri).upload(created.uploadUrl, {
  httpMethod: 'PUT',
  uploadType: UploadType.BINARY_CONTENT,
  headers: { 'Content-Type': contentType },
  onProgress: ({ bytesSent, totalBytes }) => setProgress(Math.round((bytesSent / totalBytes) * 100)),
});

// 3. Ab "Processing" state, polling (Section 10)
router.replace({ pathname: '/my-uploads' });
```

Auth header ka helper:

```ts
async function api(path: string, init: RequestInit = {}) {
  const token = await getAccessToken(); // SecureStore + refresh
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}
```

---

## 16. Roadmap aur repo mein agle qadam

### Phases

| Phase | Kya | Nateeja |
| --- | --- | --- |
| **0 (abhi)** | POC: Function URLs, S3 listing | Upload chal rahi hai |
| **1 (MVP hardening)** | Cognito + API Gateway, DynamoDB, private buckets, server-side thumbnail (Lambda + ffmpeg), status polling, `createVideo`/`listVideos`/`getVideo` | Ghar ki tarah mehfooz, thumbnail server banata hai |
| **2 (Shorts)** | MediaConvert HLS, CloudFront, EventBridge + Step Functions, push notification, moderation | Asli shorts feed |
| **3 (Scale)** | CDK + CI/CD + 3 accounts, WAF, alarms/DLQ, analytics, search/recommendation | Production grade |

### Phase 1 ke chhote qadam (sab se pehle yeh)

1. Ek AWS **dev** account/region chuno (ek hi region).
2. DynamoDB `Videos` table banao (GSI `feed`, `byOwner`, TTL on).
3. Do buckets: `raw` aur `media` (private). `raw` pe EventBridge notifications on.
4. ffmpeg layer banao aur laptop pe pehle commands chala kar dekho (Section 8).
5. `processVideo` Lambda deploy karo, `raw` ke event se jodo. Console se ek video upload kar ke dekho ke `thumbs/...` ban rahi hai aur DB mein `READY` aata hai.
6. `createVideo` Lambda + API Gateway (abhi bina auth), app se jodo (title/category bhi bhejo).
7. `listVideos` Lambda, home screen ko usi se jodo (thumbnail URL DB ke key se).
8. Cognito + JWT authorizer lagao, phir app mein login.
9. Polling ke saath "Processing" state UI.
10. Tab jaa kar S3 listing wali purani Lambda (`getAllVideos`) hata do.

Har qadam ke baad chalao aur dekho, phir agla. Aise masle ek waqt pe ek hi aate hain.

---

## 17. Glossary (aasan lafzon mein)

| Lafz | Matlab |
| --- | --- |
| **Presigned URL** | S3 ki aisi link jisme thori der ke liye upload/download ki ijazat chhupi hoti hai. |
| **JWT** | Login ke baad milne wala token. Server isko check kar ke pehchanta hai ke user kaun hai. |
| **Cognito** | AWS ki login service (signup, signin, tokens). |
| **IAM role** | AWS mein "kaun kya kar sakta hai" ki list. |
| **Event-driven** | Kuch hone (upload) par khud kaam shuru ho. Koi baar baar poochta nahi. |
| **EventBridge** | AWS ka event router. |
| **Step Functions** | Kaam ke steps ko ek order mein chalane wala workflow, retries ke saath. |
| **Idempotent** | Ek kaam do baar chal jaye to nuksan na ho. |
| **DLQ** | Dead Letter Queue. Fail hone wale messages ka mehfooz store. |
| **Transcode** | Video ko doosre format/size mein badalna. |
| **HLS** | Video ko chhote tukron mein bhej kar stream karne ka format (`.m3u8` + segments). |
| **ABR** | Adaptive bitrate: net slow ho to quality khud kam. |
| **CDN (CloudFront)** | Duniya bhar mein paas ke servers se files bhejna. |
| **OAC** | Origin Access Control. S3 ko batata hai ke sirf CloudFront hi file maang sakta hai. |
| **DynamoDB** | AWS ka serverless database. Key dete ho, item foran milta hai. |
| **Table / Item / Attribute** | DynamoDB mein folder / ek record / record ki fields. |
| **Partition key / Sort key** | Item dhoondhne ki key / ek key ke andar tarteeb. |
| **Scan** | DynamoDB ki poori table parhna. Mehnga aur sust, isse bachte hain. |
| **GSI** | DynamoDB ka extra index, doosre tareeqe se query karne ke liye. |
| **RDS Proxy** | SQL database ke saath Lambdas ke connections sambhalne wala AWS ka proxy. |
| **Sparse index** | Aisa index jisme sirf woh items aate hain jin mein key attribute ho. |
| **TTL** | DynamoDB ka khud purane items delete karne ka feature. |
| **IaC** | Infrastructure ko code mein likhna (CDK/SAM/Terraform). |
| **Callback / Webhook** | Ek system dusre ko HTTP request bhej kar batata hai ke kaam ho gaya. |
| **HMAC signature** | Shared secret se banaya hua nishaan jo sabit karta hai ke request asli bheji hui hai. |
| **Idempotent** | Ek kaam do baar chale to bhi nateeja ek hi rahe, nuksan nahi. |
| **DLQ** | Dead-letter queue: jo message baar baar fail ho, woh yahan jama hota hai taake koi dekh sake. |
| **Reconciliation job** | Periodic safai ka kaam jo atki hui cheezein dhoond kar theek karta hai. |
| **API Destination** | EventBridge ka feature jo events ko kisi HTTPS endpoint ko retries ke saath bhejta hai. |
| **Optimistic UI** | Server ke jawab se pehle hi UI mein nateeja dikha dena. |

---

## 18. Aksar poochhe jane wale sawal

**Kya Lambda mein ffmpeg se video transcode ho sakti hai?**
Chhoti shorts (<= 60s) ke liye haan. Lambda ki limits (15 min, memory, `/tmp`) yaad rakho. Bari ya bohat zyada videos ke liye MediaConvert ya Fargate.

**Hum MediaConvert hi pehle se kyun nahi lagate?**
Laga sakte ho. Is ka setup (role, presets, events) thora zyada hai. Isliye Phase 1 mein Lambda + ffmpeg se thumbnail aur validation, aur Phase 2 mein MediaConvert.

**App seedha S3 ko credentials de kar upload kar sakti hai? (Cognito Identity Pool)**
Ho sakta hai, lekin rules aur validation app/IAM mein chale jate hain. Presigned URL backend se dena zyada control deta hai (title, size, user limit sab server check karta hai).

**Thumbnail phone se bhejna kab theek hai?**
Sirf POC mein. Production mein server isko banata hai (ek jaisi quality, ek hi upload, adhoori upload ka masla nahi).

**Server na bana kar auth kaise hogi?**
Section 4: Cognito token deta hai, API Gateway token check karta hai, Lambda ownership check karta hai.

**User ko "video tayyar" kaise pata chale?**
Section 10: pehle polling, baad mein push notification.

**Backend ko "upload ho gayi" kaise pata chale?**
S3 `Object Created` event. Client ki baat par bharosa nahi.

**Video ki list kahan se aati hai?**
DynamoDB (`feed` index). S3 listing se nahi.

**Ek hi video do baar na bane, isse kaise bachayen?**
`POST /videos` se ek `videoId` banta hai. Retry mein usi `videoId` ki nayi upload link li jati hai. Pipeline `claim()` ki wajah se do baar kaam nahi karti.

**Agar video 60 second se lambi ho?**
`processVideo` use `FAILED` mark kar deta hai ("Video is longer than 60 seconds"). App ko status polling se pata chalta hai aur wajah dikhati hai. Behtar: app mein bhi upload se pehle duration check karo.

**DynamoDB kya hai aur kyun chahiye? SQL ya Mongo kyun nahi?**
Section 7: S3 sirf files rakhta hai, data ke liye DB chahiye. DynamoDB Lambda ke saath asaan hai (connections ka masla nahi, password nahi, server nahi). SQL/Mongo ka muqabla aur kab kya chunna hai, wohi section mein hai.

**Abhi sab se pehle kya karun?**
Section 16, Phase 1, qadam 1 se.

---

## 19. Hamara server pehle se hai: Hybrid architecture (meri asal recommendation)

Ab tak ke sections mein maine "sab kuch Lambda" wala raasta likha. Lekin tumhare paas **pehle se ek server hai jis pe code chal raha hai**. Is surat mein dobara poora backend Lambda mein banana galat hoga. Behtar yeh hai:

**Server = business logic, login, database. AWS = files aur video ka bhaari kaam.**

```
                    ┌──────────────────────── Tumhara Server ─────────────────────────┐
App ── login ─────► │ POST /videos        (record banao + presigned URL do)            │
App ◄── feed ────── │ GET  /videos        (DB se feed)                                 │
App ◄── status ──── │ GET  /videos/:id    (DB se status)                               │
                    │ POST /internal/video-events  ◄── (callback, Section 20)          │
                    │ DB (jo pehle se hai)                                             │
                    └───────────────┬──────────────────────────────────────────────────┘
                                    │ presigned URL (server ne banayi)
App ── video file seedha ──────────►S3 (raw/)
                                    │ "Object Created" event
                                    ▼
                    EventBridge ► Step Functions ► Lambda (ffprobe, thumbnail) ► MediaConvert
                                    │
                                    ▼
                          Aakhir mein: server ko callback (READY / FAILED)
```

### Kaun sa endpoint kahan?

| Kaam | Kahan | Wajah |
| --- | --- | --- |
| `POST /videos` (record + upload link) | **Server** | Login, title/category validation, DB sab wahan hai |
| `POST /videos/:id/upload-url` (retry pe nayi link) | **Server** | Same |
| `GET /videos` (home feed) | **Server (DB se)** | Login, category, sirf `READY` videos, pagination |
| `GET /videos/:id` (status) | **Server** | App polling karti hai |
| `DELETE /videos/:id` | **Server** | DB row + S3 files dono delete karni hain |
| `POST /internal/video-events` (callback) | **Server** | Pipeline yahan result batati hai |
| S3 event, ffprobe, thumbnail, transcode | **AWS** | Heavy kaam, server pe nahi |

### POC ke `getUploadUrl` aur `getAllVideos` ka kya hoga?

- `getUploadUrl` Lambda: **server mein chala jayega.** Wohi presigned URL wali baat, bas ab login check ke baad aur record banane ke baad.
- `getAllVideos` Lambda: **meri raaye mein bilkul server pe hona chahiye**, aur S3 listing se nahi balke **DB se**. S3 listing mein category, status, owner, order kuch nahi hota. POC mein theek tha. Production mein yeh Lambda hata dena.

Dono Lambdas POC ke liye rakho, production mein server ke endpoints inki jagah lein ge. App mein sirf `constants/api.ts` ka URL aur request ki shakal badlegi.

### Server se presigned URL banana (example)

Yeh sirf sketch hai (`db`, `requireLogin` tumhare apne code ke hain):

```js
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: 'eu-central-1' });

app.post('/videos', requireLogin, async (req, res) => {
  const { title, seriesId, contentType, sizeBytes } = req.body;

  if (!['video/mp4', 'video/quicktime'].includes(contentType)) {
    return res.status(400).json({ error: 'Only MP4 or MOV videos are allowed.' });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes > 200 * 1024 * 1024) {
    return res.status(400).json({ error: 'The video is too large.' });
  }

  const videoId = crypto.randomUUID();
  const rawKey = `raw/${req.user.id}/${videoId}/original.mp4`;

  await db.videos.create({
    id: videoId, ownerId: req.user.id, title, seriesId,
    status: 'PENDING_UPLOAD', rawKey,
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: process.env.RAW_BUCKET, Key: rawKey, ContentType: contentType }),
    { expiresIn: 900 },
  );

  res.json({ videoId, uploadUrl, expiresIn: 900 });
});
```

### Server ko AWS ka access kaise milega?

- Server **AWS pe hai** (ECS/EC2): us ke **IAM role** se. Password/keys code mein nahi.
- Server **AWS pe nahi hai** (kisi aur hosting pe): ek alag IAM user ke access keys banao, **sirf zaroori permission** do, aur keys ko env/secret manager mein rakho, kabhi git mein nahi. Keys time ke saath badalte raho (rotate).
- Minimum permission (upload link ke liye sirf yeh):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject"], "Resource": "arn:aws:s3:::RAW_BUCKET/raw/*" }
  ]
}
```

- Ek baat yaad rakho: presigned URL us credential ke saath chalti hai jis ne banayi. Agar server **temporary role credentials** use karta hai to URL us ke expire hone ke saath mar sakti hai, chahe `expiresIn` zyada ho. Isliye link chhoti (15 min) rakho aur app ko "link expire hui to nayi lo" wali logic do.
- Video ki file **kabhi server se nahi guzarti.** App seedha S3 ko bhejti hai. Is liye server pe load kam rehta hai.

### Is raaste ke fayde aur nuksan

| Fayda | Nuksan |
| --- | --- |
| Login aur permissions ek hi jagah (jo pehle se hai) | Server ko callback aur AWS credentials ka naya kaam sambhalna hai |
| Ek hi database, ek hi sach (source of truth) | Pipeline aur server ke beech ka rasta (callback) khud reliable banana parta hai (Section 20) |
| Team ka purana code/experience kaam aata hai | Agar server down ho to callback ruk jati hai (hal: queue/retry) |
| Naya auth system (Cognito) zaroori nahi | Section 4 aur Section 7 ka DynamoDB wala part tab zaroori nahi |

Section 4 (Cognito) aur Section 7 (DynamoDB) tab ke liye hain jab **naya backend scratch se** banao. Agar server aur uska DB pehle se hai, to metadata **usi DB mein** rakho. Aise do alag databases ko sync karne ka dard nahi hota.

---

## 20. Lambda ke baad server ko callback (webhook)

**Sawal:** Pipeline khatam hone ke baad kya Lambda server ko call kar ke bata sakta hai, aur server DB update kar de?

**Jawab:** Haan, bilkul. Isko **callback** ya **webhook** kehte hain. Lekin production mein sirf `fetch()` kar dena kaafi nahi, kyunke server down ho to video hamesha `PROCESSING` mein atak jayegi.

### Teen raaste

| | A) Lambda seedha DB update kare | B) Lambda server ko HTTP callback kare | C) Queue/EventBridge beech mein |
| --- | --- | --- | --- |
| Kaise | Lambda DB mein `UPDATE` karta hai | Lambda `POST /internal/video-events` karta hai | Event queue mein jata hai, wahan se server ko milta hai |
| Fayda | Sab se seedha | Business logic server mein rehti hai (push, analytics, rules) | Server down ho to event ruka rehta hai, retry khud hota hai |
| Nuksan | Lambda ko DB ka access (VPC, password, connections), logic do jagah | Server down ho to khud retry likhna parta hai | Thora zyada setup |
| Kab | Sirf agar DynamoDB use ho raha ho | **Phase 1** | **Production (meri recommendation)** |

**Meri raaye:**

- **Phase 1:** B (HTTP callback), lekin retry + signature ke saath (neeche code hai).
- **Production:** C. Do achhe tareeqe:
  1. **EventBridge API Destination**: AWS khud tumhare HTTPS endpoint ko call karta hai, retries ke saath, aur nakam events DLQ (dead-letter queue) mein jate hain. Is mein auth header (API key) lag sakta hai. Dhyan rakho ke target ka timeout chhota (kuch second) hota hai, isliye server **foran 2xx** de kar kaam baad mein kare.
  2. **SQS queue + server ka worker**: Pipeline `VideoReady` message queue mein daalti hai, server ka worker usay parh kar DB update karta hai. Is mein server ko bahar se koi endpoint kholna hi nahi parta (server khud queue se leta hai). Agar server firewall ke peeche hai to yeh sab se acha hai.
- **A kab theek hai?** Sirf jab DB DynamoDB ho aur Lambda ko usi account mein access mile. Tumhara server ka DB pehle se hai, to A mat chuno.

### Kaun callback bheje?

Har step nahi. Sirf pipeline ka **aakhri step** (`MarkReady` ya `MarkFailed`). Chaho to shuru mein ek `PROCESSING` callback bhi.

Payload (READY):

```json
{
  "eventId": "7f0c...:READY",
  "videoId": "7f0c...",
  "status": "READY",
  "thumbnailKey": "thumbs/a1b2/7f0c.../thumb.jpg",
  "playbackKey": "hls/a1b2/7f0c.../index.m3u8",
  "durationSec": 21.4,
  "width": 1080,
  "height": 1920
}
```

Payload (FAILED):

```json
{
  "eventId": "7f0c...:FAILED",
  "videoId": "7f0c...",
  "status": "FAILED",
  "errorCode": "TOO_LONG",
  "errorMessage": "Video is longer than 60 seconds"
}
```

`eventId` ko **stable** rakho (`videoId:status`), random nahi. Phir retry mein wohi event dobara jaye to server pehchan sakta hai.

### Callback ki security (bohat zaroori)

Yeh endpoint **user ke login ke token se nahi** chalta, to ise khula chhorna khatarnak hai: koi bhi `READY` bhej kar ghalat video publish kar sakta hai. Ye rules:

1. Alag path rakho, jaise `/internal/video-events`. Normal user routes se alag.
2. **HMAC signature**: Lambda aur server ke paas ek **shared secret** hota hai. Lambda body + timestamp ka signature bhejta hai, server dobara banata hai aur compare karta hai.
3. **Timestamp check**: 5 minute se purani request reject (replay attack se bachne ke liye).
4. Secret **Secrets Manager / SSM** mein, Lambda ke code ya git mein nahi.
5. Sirf HTTPS.
6. Server check kare: video maujood hai? Status ka badlav jaiz hai? (`READY` sirf `PENDING_UPLOAD`/`PROCESSING` se.)
7. Optional: agar Lambda ka outgoing IP fix ho (NAT Gateway), to server pe IP allowlist.

### Idempotent hona zaroori hai

Network mein ek hi callback do baar aa sakti hai (retry ki wajah se). Server ka update aisa ho ke **do baar chalane se bhi nuksan na ho**: agar video pehle se `READY` hai to dobara `READY` aaye to chupchaap `200` de do.

### Lambda ka code (sending side)

`lambda/notifyServer.mjs` (sketch, Node 20):

```js
import { createHmac } from 'node:crypto';

const CALLBACK_URL = process.env.CALLBACK_URL;       // https://api.tumhara-server.com/internal/video-events
const CALLBACK_SECRET = process.env.CALLBACK_SECRET; // production mein Secrets Manager se lo

function sign(timestamp, body) {
  return createHmac('sha256', CALLBACK_SECRET).update(`${timestamp}.${body}`).digest('hex');
}

export async function notifyServer(payload) {
  const body = JSON.stringify({
    eventId: `${payload.videoId}:${payload.status}`,
    ...payload,
  });

  const maxAttempts = 4;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Har attempt ka naya timestamp, taake purani signature 5 minute se expire na ho
    const timestamp = Date.now().toString();

    try {
      const res = await fetch(CALLBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Timestamp': timestamp,
          'X-Signature': sign(timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) return;

      lastError = new Error(`Callback failed with status ${res.status}`);
      // 4xx (429 ke siwa) ka matlab request hi ghalat hai, dobara bhejna bekar
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err; // network error ya timeout
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1))); // 1s, 2s, 4s
    }
  }

  // Yahan throw karne se Step Functions retry karega ya DLQ mein jayega
  throw lastError;
}
```

`MarkReady` Lambda ke andar:

```js
await notifyServer({
  videoId,
  status: 'READY',
  thumbnailKey,
  playbackKey,
  durationSec,
  width,
  height,
});
```

### Server ka code (receiving side)

Express ka sketch. **Raw body** isliye chahiye ke signature bilkul wahi bytes pe check hota hai jo Lambda ne bheje:

```js
import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.CALLBACK_SECRET;
const MAX_AGE_MS = 5 * 60 * 1000;

app.post(
  '/internal/video-events',
  express.raw({ type: 'application/json' }), // JSON parser se PEHLE, sirf is route pe
  async (req, res) => {
    const body = req.body.toString('utf8');
    const timestamp = Number(req.header('X-Timestamp'));
    const signature = req.header('X-Signature') ?? '';

    // 1) Timestamp: NaN ko bhi reject karo, warna check chup chaap pass ho jata hai
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_AGE_MS) {
      return res.status(401).json({ error: 'The request is too old.' });
    }

    // 2) Signature
    const expected = crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'The signature is not valid.' });
    }

    // 3) Ab body pe bharosa kar sakte hain
    const event = JSON.parse(body);
    const video = await db.videos.findById(event.videoId);
    if (!video) return res.status(404).json({ error: 'Unknown video.' });

    // 4) Idempotent update
    if (event.status === 'READY') {
      if (video.status !== 'READY') {
        await db.videos.update(event.videoId, {
          status: 'READY',
          thumbnailKey: event.thumbnailKey,
          playbackKey: event.playbackKey,
          durationSec: event.durationSec,
        });
        // yahan push notification bhi bhej sakte ho (Section 10)
      }
    } else if (event.status === 'FAILED') {
      if (video.status !== 'READY') {
        await db.videos.update(event.videoId, {
          status: 'FAILED',
          errorMessage: event.errorMessage,
        });
      }
    } else {
      return res.status(400).json({ error: 'Unknown status.' });
    }

    res.sendStatus(200); // jaldi 2xx do
  },
);
```

(`db.videos.*` tumhare apne DB layer ka naam hai, yeh pseudo-code hai.)

### Agar callback phir bhi na pahunche?

Sab kuch fail ho sakta hai (server maintenance, wrong secret). Is liye **do cheezein** lazmi hain:

1. **DLQ + alarm.** Nakam callbacks ek queue mein jayen aur CloudWatch alarm bajay. Phir kisi ko dikhta hai ke kuch atka hua hai.
2. **Reconciliation job (safai ka kaam).** Server har 5-10 minute mein check kare: jo videos 15 minute se `PROCESSING` hain (ya 24 ghante se `PENDING_UPLOAD`), un ka asal haal AWS se pooche (Step Functions execution status ya S3 mein output files maujood hain ya nahi) aur status theek kar de. Is se koi video hamesha ke liye atakti nahi.

### Callback hi kyun, polling pipeline pe kyun nahi?

Server baar baar pipeline se poochhta rahe to bekar load aur delay hai. Callback (ya queue) foran khabar deta hai. Phir bhi reconciliation job lagao, jo sirf **atki hui** cheezein pakadti hai, har video nahi.

### Step Functions se seedha HTTP call

Step Functions mein "HTTP Task" state bhi hota hai jo HTTPS endpoint ko seedha call kar sakta hai (EventBridge connection ke saath auth). Is se `MarkReady` ke liye alag Lambda ki zaroorat kam ho sakti hai. Yeh naya feature hai, pehle AWS docs mein shape dekh lena.

---

## 21. ffmpeg: Lambda ya ECS, aur connections ka masla

**"Agar ffmpeg Lambda ki jagah ECS mein chalayen to kya connections ka masla phir bhi hoga?"**

Pehle yeh poochho ke "connections" se kya muraad hai. Teen alag masle hain:

### 1) Database connections

**Sab se behtar jawab: ffmpeg wale worker ka DB se koi lena dena hi na ho.**

Worker ka kaam: S3 se video parho, ffmpeg chalao, S3 mein output rakho, aur **result bata do** (callback/event). DB update **server** kare (Section 20). Phir na Lambda mein DB connection masla hai na ECS mein.

Agar kisi wajah se worker ko DB tak jana hi pare:

| | Lambda | ECS (Fargate) |
| --- | --- | --- |
| Connection kaise bante hain | Har saath chalne wali execution apna connection kholti hai (ek warm instance reuse karta hai, lekin 100 videos ek saath ho to ~100 connections) | **Long-running service** (queue se jobs leta hai): pool reuse hota hai, connections = tasks x pool size. **Har job pe naya task** (`RunTask`): har task naya connection, bilkul Lambda jaisa |
| Hal | RDS Proxy, ya concurrency limit (`reserved concurrency`) | Pool size chhota, tasks ki limit, ya RDS Proxy |
| Seedha nateeja | ECS mein masla **khud ba khud khatam nahi hota**, sirf shakal badalti hai | |

Yani "ECS lein to connection ka masla nahi hoga" **sahi nahi hai.** ECS mein masla kam **predictable** hota hai (kyun ke tasks ki tadaad tum control karte ho), lekin agar woh bhi scale out hon aur har ek bade pool khole to wohi masla.

Agar DB DynamoDB hai to yeh masla hai hi nahi (HTTP API hai, connection pool nahi).

### 2) Network connectivity

- Agar Lambda/ECS **VPC mein** hai (DB ke liye) to internet ke liye **NAT Gateway** chahiye. NAT ka kharcha aur data charges hote hain.
- S3 ke liye **S3 Gateway VPC endpoint** lagao (free). Phir video S3 se NAT ke bagair aati hai aur data charges bachte hain.
- Callback server ko jata hai (internet par): worker ko outbound access chahiye. Lambda VPC ke bahar ho (agar DB nahi chahiye) to yeh asaan hai.

### 3) Time aur size ki limits

Ye "connection" nahi, lekin Lambda ya ECS chunne ki asal wajah yehi hoti hai: Lambda 15 minute, ECS ki koi limit nahi.

### Lambda vs ECS Fargate ffmpeg ke liye (shorts <= 60s)

| | Lambda | ECS Fargate |
| --- | --- | --- |
| Start hone mein | Foran (cold start ~ ek-do second, container image mein zyada) | Task start mein 30-60 second tak (image pull, ENI) |
| Limit | 15 min, 10 GB `/tmp`, 10 GB memory | Zyada flexible |
| Kharcha | Sirf jitni der chale | Jitni der task chale (kam se kam 1 minute ka billing) |
| Maintenance | Kam | Container, scaling, image updates, logs |
| Concurrency control | Reserved concurrency | Task limits, queue depth pe auto scaling |
| Kab | **Shorts: probe, thumbnail, chhota transcode** | Lambda ki limits kam parein, custom filters, bari/lambi videos |

### Meri recommendation

1. **Phase 1:** Lambda + ffmpeg (validate + thumbnail). Worker DB se baat na kare.
2. **Phase 2:** Transcode/HLS ke liye **MediaConvert** (ffmpeg khud chalane ka bojh nahi).
3. **ECS tab** jab sach mein zaroorat pare: video 60 second se lambi ho, custom ffmpeg (watermark, filters), ya Lambda ki memory/time kam parna. Phir bhi worker **queue se jobs le**, aur result **callback** se bataye.

Aur ek aam usool: **jitni bhaari cheez ho, utni usay API se door aur queue ke peeche rakho.** Is se spike aaye to API nahi girta, jobs line mein lag jati hain.

### Concurrency ko kaabu mein rakhna (dono mein)

Agar ek saath 500 videos upload hon, 500 ffmpeg ek saath mat chalao (kharcha, aur downstream service pe bojh). **SQS queue** beech mein rakho, aur concurrency limit lagao (Lambda ka SQS mapping `maximum concurrency` ya ECS tasks ki limit).

---

## 22. Production checklist: kya karna chahiye aur kya nahi

Yeh section "kya zaroori hai, kya baad mein, kya kabhi nahi" ek jagah deta hai.

### Launch se pehle lazmi (Must)

| # | Cheez | Wajah |
| --- | --- | --- |
| 1 | Har endpoint pe login. Koi **public Lambda Function URL** nahi | Bina login koi bhi S3 bhar sakta hai |
| 2 | Upload link **server banaye**, key server ki (`raw/{userId}/{videoId}/original.mp4`) | App ki bheji hui file name pe bharosa nahi |
| 3 | Ek `videoId` per video, retry pe usi ki nayi link | Duplicate videos nahi |
| 4 | S3 buckets **private**, delivery CloudFront se | Koi seedha download na kare |
| 5 | Backend ko S3 **event** se pata chale, client se nahi | Client jhoot bol sakta hai |
| 6 | Real file ki check: ffprobe se asli video, duration <= 60s, size, codec | Client ki di hui `Content-Type` pe bharosa nahi (presigned link usay enforce nahi karti) |
| 7 | Status machine: `PENDING_UPLOAD`, `PROCESSING`, `READY`, `FAILED` | App ko saaf haal dikhana |
| 8 | Pipeline **idempotent** (do baar chale to nuksan nahi) | S3 events aur retries duplicate ho sakte hain |
| 9 | Callback **signed**, retry ke saath, **DLQ** ke saath | Section 20 |
| 10 | **Reconciliation job** (atki hui videos pakadne wala) | Koi video hamesha `PROCESSING` na rahe |
| 11 | Size limit aur **per-user rate limit** | Kharcha aur ghalat istemal rokne ke liye |
| 12 | Secrets (callback secret, AWS keys) **Secrets Manager/SSM** mein | Git ya code mein nahi |
| 13 | Logging mein har line pe `videoId`, aur **CloudWatch alarms** (pipeline fail, DLQ mein messages, Lambda errors) | Masla pata chale |
| 14 | S3 **lifecycle rules**: adhoori multipart uploads delete, purani `raw/` files kuch din baad delete | Faltu kharcha |
| 15 | DB **backup** (DynamoDB point-in-time recovery ya SQL ke automated backups) | Data na jaye |
| 16 | **Alag environments** (dev/prod, alag buckets, alag secrets) aur infrastructure **code mein** (CDK/Terraform) | Mistakes se bachne ke liye |
| 17 | AWS **Budget alert** | Kharcha achanak na barhe |
| 18 | Sab kuch **ek region** mein | Latency aur confusion kam |
| 19 | Delete flow: video delete ho to DB row + S3 files (raw, thumb, HLS) dono jayein | Privacy aur kharcha |

### Jaldi baad mein (Should)

- Push notification jab video `READY` ho (Section 10).
- MediaConvert se HLS (kayi quality).
- Content moderation (Rekognition ya koi aur).
- Crash/error reporting (Sentry jaisa) app aur server dono mein.
- App mein upload resume/retry aur "My uploads" screen.
- WAF/rate limiting zyada sakht.
- Upload se pehle app mein duration check (60s se lambi video foran rok do).
- Admin ke liye takedown/report flow.

### Baad mein (Later)

- ABR ki kayi qualities, signed URLs/cookies (agar private/paid content ho).
- Analytics (views, watch time), recommendation.
- Multi-region.

### Yeh kabhi mat karo (Don't)

| Ghalat | Kyun |
| --- | --- |
| Video ki file apne server ya API Gateway/Lambda se guzarna | Size limits (API Gateway ~10 MB, Lambda ~6 MB payload) aur load. Presigned URL se seedha S3 |
| ffmpeg ko API request ke andar chalana | Timeout aur server block |
| Client ki bheji `Content-Type`/duration/size pe bharosa | Jhoot ho sakta hai |
| S3 listing ko feed banana | Order, category, status kuch nahi, aur lambi list pe sust |
| AWS keys app ke andar rakhna | App decompile ho sakti hai |
| S3 bucket public karna | Bandwidth ka kharcha aur privacy |
| Callback endpoint ko bina signature chhorna | Koi bhi `READY` bhej sakta hai |
| Har Lambda/worker se DB ko seedha bandhna jab zaroorat na ho | Connections aur coupling ka dard |

### Yeh sab abhi zaroori hai ya nahi?

POC se production ke darmiyan ek sensible raasta:

1. **Abhi (POC ke qareeb):** Server pe `POST /videos` + `GET /videos` + `GET /videos/:id`, upload progress, Lambda ffprobe + thumbnail, callback (signed + retry).
2. **Beta se pehle:** Checklist ki sab "Must" cheezein, khaas taur par login, signed callback, DLQ, reconciliation, alarms, lifecycle rules.
3. **Public launch se pehle:** CloudFront + HLS (MediaConvert), push notification, moderation.

Agar sirf ek cheez chunni ho jo sab se zyada bachaye: **"client pe bharosa mat karo, har cheez server/AWS khud check kare."**
