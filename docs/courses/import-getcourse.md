# Importing a GetCourse Course into a Shop

`apps/backend/src/scripts/course-import-export.ts` loads one course of the GetCourse export
(t-2026-10-13-29 stage 1) into one shop. That covers its lessons with their text, sections, covers,
videos, files and links, and the files themselves, uploaded through the file module. The migration at deploy cannot
carry the 4.5 GB of video, so you run the script by hand against production, from a Mac that holds
the export.

## What You Need

- The export, one folder per course, in [export/](/Users/ivanprotsko/upready/evidence/upready-store/t-2026-10-13-29/export)
  on Ivan's Mac, `liver/` and `lymph/`. Each holds `course.json`, `lessons/`, `files/` and
  `videos/`. `liver/drip.json` names the lessons that open on a later day of the program (days 6
  and 7); a folder without one leaves every lesson open. The commands below call that folder
  `$EXPORTS`.
- A checkout of this repository at a commit that has the script, with `pnpm install` done.
- The production `DATABASE_URL`, reachable from the Mac (a tunnel to the database host works).
- The production S3 variables `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
  `S3_REGION`. Without `NODE_ENV=production` and `S3_BUCKET` the file module writes to the local
  `static/` folder instead (`useS3` in `apps/backend/medusa-config.ts`), so the shop would point at
  files that exist only on your Mac.
- The five variables production refuses to start without (`REQUIRED_IN_PRODUCTION` in
  `apps/backend/src/config/production-env.ts`), which are `JWT_SECRET`, `COOKIE_SECRET`,
  `STORE_CORS`, `ADMIN_CORS` and `AUTH_CORS`. The script signs nothing and serves nothing, but `medusa exec` loads
  the same config and stops when one is empty.
- No `REDIS_URL`. Without it the run keeps its events in memory (`useRedis` in
  `apps/backend/src/config/redis.ts`) and touches no production queue.

`medusa exec` also reads `.env.production` from `apps/backend` when one is there (`loadEnv` in
`medusa-config.ts`). Run from a checkout without one, or check that it names nothing you do not
want.

## Run It

From `apps/backend`, first with `dry-run`. It reads the export and the database, uploads and writes
nothing, and prints the same summary a real run prints.

```bash
cd apps/backend
export NODE_ENV=production DATABASE_URL=… S3_BUCKET=… S3_ENDPOINT=… S3_ACCESS_KEY=… \
  S3_SECRET_KEY=… S3_REGION=… JWT_SECRET=… COOKIE_SECRET=… STORE_CORS=… ADMIN_CORS=… AUTH_CORS=…
unset REDIS_URL

npx medusa exec ./src/scripts/course-import-export.ts \
  export="$EXPORTS/liver" tenant=cherkashino.ru course=ochishchenie-pecheni dry-run
```

Read the summary line, then run the same command without `dry-run`. Do the same for the lymph
course with `export="$EXPORTS/lymph" course=nabor-dlya-ochischeniya-limfy-cherkashino`, and for
the kidneys course with its own export folder and `course=course-ochishchenie-pochek-cherkashino`
once that export exists.

- `tenant` is the shop's host, looked up in `tenant_domain`. A shop that sells the course on a
  second host of its own (cherkashino.com) gets its own run with that host, its own course row and
  its own copy of the files under its own prefix.
- `course` is the course's slug, or the handle of the shop's product that sells it. A product that
  sells no course yet gets one, a draft titled after the product. You publish it in the panel. A
  product that sells nothing but the course also needs `scripts/mark-course-product.ts` to drop
  shipping. The script does neither, since the lymph product is a set.
- Each argument also reads as `--export=…`, and from `COURSE_IMPORT_EXPORT`,
  `COURSE_IMPORT_TENANT`, `COURSE_IMPORT_COURSE` and `COURSE_IMPORT_DRY_RUN=1`.

## Before the First Run on cherkashino.ru

The liver course there already holds 23 lessons from an earlier seed
(`src/scripts/seed-course-lessons.ts`), none of them from GetCourse. The import adds its 13 with
`order` 1 to 13 and leaves the 23 alone, so the course shows both sets mixed by `order` until
someone decides what happens to the old ones. The summary lists them as "not from the export".
Deleting them is Ivan's decision, not the script's.

## What the Run Writes

- Videos and files go up private, pictures and covers public, under
  `courses/<tenant_id>/<course slug>/videos|files|images/`. The provider adds its own unique part to
  every key.
- A lesson stores each video's and file's `key` and `url` in `videos` and `attachments`. Buyers get
  them only through `GET /store/tenant/courses/:id/media?key=…`, which checks the purchase and
  answers 302 to an address the S3 provider signs for one hour. Pictures stay their public address,
  in the body and in `cover_url`.
- The lesson body is the export's Markdown without its GetCourse header, with every video and file
  link pointing at the media route and every picture at its public address.
- Modules become `section` and `section_order`, the list description becomes `summary`, Telegram
  and YouTube links become `links`. The course gets the first Telegram channel and chat it finds,
  unless it has its own.
- `lesson.metadata` keeps `getcourse_id` and `getcourse_files`, what the next run matches against.

## Running It Again

A second run is safe and is the way to pick up a corrected export.

- A lesson is matched by `metadata.getcourse_id` and updated in place, so its id and every buyer's
  progress on it survive.
- A file is uploaded again only when the key the lessons recorded for it is gone from the bucket or
  has a different size. A run with nothing new uploads nothing and reports every lesson unchanged.
- The run overwrites what the owner changed in the panel on an imported lesson: its title, body,
  order, section, cover, summary, videos, files and links. `available_from_day` is overwritten only
  when the folder has a `drip.json`.
- Nothing is deleted. A lesson that left the export stays, and so does a file that a re-upload
  replaced.

## How Long It Takes

Uploading is the whole cost, about 2.0 GB for the liver course (33 files) and 2.8 GB for the lymph
course (94 files). At 50 Mbit/s up that is about 5 and 8 minutes, at 20 Mbit/s about 13 and 19.
The database part takes seconds. Against a local database with the local provider, the liver
course's 13 lessons and 33 files took 8 seconds in all.
