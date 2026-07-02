# AmplifySecureUpload — Agent Context

## Project Overview

An Nx monorepo containing an Angular 21 SPA and an AWS Amplify Gen 2 backend that implements **malware-scanned file uploads** using AWS GuardDuty's Malware Protection Plan. Uploads land in a quarantine bucket, get scanned, and are only moved to a clean bucket on `NO_THREATS_FOUND`.

## Tech Stack

| Layer      | Technology                                |
| ---------- | ----------------------------------------- |
| Frontend   | Angular 21 (standalone components, Rspack) |
| Backend    | AWS Amplify Gen 2 (CDK, sandbox)          |
| Monorepo   | Nx 23                                     |
| Testing    | Vitest (unit), Playwright (e2e)           |
| Linting    | ESLint 9 + Prettier                       |
| Package    | Rspack (app), tsc (library)               |

## Project Structure

```
apps/
  app/                    # Angular 21 SPA
    amplify/              # Amplify Gen 2 backend definition
      backend.ts          # Entry point: defineBackend({ auth, storage })
      auth/resource.ts    # Auth config
      storage/resource.ts # Uses defineSecureStorage from the library
    src/                  # Angular app source
packages/
  amplify-secure-storage/ # Reusable library (published as two entry points)
    src/
      backend/            # CDK constructs (deployed via Amplify)
        index.ts
        secure-storage.ts # defineSecureStorage() — dual-bucket wrapper
        guard-duty.ts     # GuartDutyScanning CDK construct
        guard-duty/handler.ts  # Lambda: copy from quarantine → clean on clean scan
      client/             # Client-side helpers (used in browser)
        index.ts
        dangerous-upload-data.ts  # Routes uploads to quarantine bucket
```

## Architecture — Secure Upload Flow

1. **Client calls `dangerousUploadData()`** — hijacks the S3 bucket config to point to the **quarantine bucket** (write-only) instead of the clean bucket.
2. **GuardDuty Malware Protection Plan** scans objects in the quarantine bucket automatically on PUT.
3. **EventBridge rule** listens for `GuardDuty Malware Protection Plan Scan Result` events with `scanResultStatus: NO_THREATS_FOUND`.
4. **Lambda handler** (`guard-duty/handler.ts`) copies the clean file from quarantine → clean bucket, then deletes it from quarantine.
5. **If threats found** — the file stays in quarantine (restricted access); the Lambda throws.

## Key Conventions

### defineSecureStorage (backend)
- Wraps `@aws-amplify/backend`'s `defineStorage()`.
- **Splits permissions**: write actions → quarantine bucket, read/delete → clean bucket.
- Appends quarantine bucket info to Amplify outputs so the client can read it via `Amplify.getConfig()`.
- Tags the clean bucket with the quarantine bucket name.

### dangerousUploadData (client)
- Reads `Amplify.getConfig().Storage?.S3` to find the quarantine bucket.
- Falls back to the default bucket name if no `bucket` option is passed.
- Uses `dangerousBucket` (the quarantine bucket) for the actual S3 upload.
- Sets `checksumAlgorithm: 'crc-32'`.

### Lambda handler (`guard-duty/handler.ts`)
- Receives `GuardDutyNotificationEvent`.
- If `scanResultStatus !== 'NO_THREATS_FOUND'`, throws (file stays in quarantine).
- Otherwise, copies the object to the clean bucket (`CLEAN_BUCKET` env var) and deletes from quarantine.

## Naming

- **clean / clean bucket** — the user-facing bucket, readable by end users after scanning
- **quarantine / dangerous / quarantine bucket** — write-only bucket where uploads initially land
- **dangerousUploadData** — the client-side upload function (named intentionally to signal caution)

## Important Gotchas

- The `GuartDutyScanning` class has a typo (`Guart` instead of `Guard`). Keep consistent unless explicitly asked to fix.
- The `defineSecureStorage` manipulates `Error.prepareStackTrace` to fake the stack trace for Amplify's internal resource path resolution — do not remove this.
- The `amplify-secure-storage` package uses `exports` in `package.json` with two entry points: `./client` and `./backend`. The `tsconfig.base.json` only maps the backend path — client path resolution works at runtime via the package exports.
- The Lambda handler uses `import.meta.dirname` and `import.meta.filename` (ESM) for path resolution relative to the source file.
- The quarantine bucket in `amplify_outputs.json` is listed as a separate bucket entry under `buckets[]` with name matching the clean bucket's name. The client code (`dangerous-upload-data.ts`) looks up the quarantine bucket by the clean bucket's name.

## Available Commands

```sh
npx nx serve app        # Dev server (Rspack)
npx nx build app        # Production build
npx nx test app         # Vitest unit tests (app)
npx nx test amplify-secure-storage  # Vitest unit tests (library)
npx nx lint <project>   # ESLint
npx nx e2e app-e2e      # Playwright e2e
npx nx sandbox app      # Run `ampx sandbox --once` in apps/app
```

Run `npx nx show project <name>` to see all available targets.

## Test Framework

- **Vitest** with `@analogjs/vitest-angular` for Angular component tests.
- E2E via **Playwright** (`app-e2e` directory).
- Workspace config: `vitest.workspace.ts` discovers any `vite.config.*` or `vitest.config.*`.
