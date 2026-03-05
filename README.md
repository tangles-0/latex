# LATEX

### cloud app for self-hosting and sharing images, videos, audio, documents, and archives

---

### Storage backends supported:

- Local disk
  - .env: `STORAGE_BACKEND=local`
  - Files stored under `data/uploads/...`
- Amazon AWS S3
  - .env: `STORAGE_BACKEND=s3`
  - .env: `S3_BUCKET=your-bucket`
  - .env: `S3_REGION=us-east-1`
  - Optional: `S3_ENDPOINT=https://s3.your-provider.com` for S3-compatible storage provider

## Installation

### Environment prep - local

Copy `.env.example` to eg. `.env.local`

The DATABASE_URL value will refer to localhost (or the address of a PostgreSQL db server on your network): `postgresql://latex:latex@localhost:5432/latex`

For docker, swap out the hostname for the db container name: `postgresql://latex:latex@latex-db:5432/latex`

For simplicity I create an `.env.local.docker`

### Docker - Local / Development

⚠️ (optional) To simplify setup on a local / dev instance, create `docker-compose.override.yml` in the project root and populate with the below:

```
networks:
  proxy:
    external: true

services:
  db:
    ports:
      - "5432:5432"
    networks:
      - proxy
```

⚠️ This enables access to the database server outside of docker engine's internal network, which is required for the dev app (`pnpm dev`) to connect to it or for you to use `pnpm db:push` to populate the tables.

To get started, run `docker compose up -d db` to start the database server only, then run `pnpm db:push` to create the tables

Then run `docker compose --env-file .env.local.docker up -d app --build` to start / build the app container.

### Docker - Production

Deploy your app using `docker compose --env-file .env.production up -d --build` with `DB_PUSH_PW` set to a secure string in your env file. Provision the database tables by visiting `{host}/api/admin/settings/db-push?pw={DB_PUSH_PW}`.

### Node / PM2

To run the app directly without docker, correctly set your 

## AWS Infrastructure and Deploy

- CDK app: `infra/cdk`
- New one-command flows (idempotent):
  - `pnpm infra:deploy:dev`
  - `pnpm infra:deploy:prod`
  - `pnpm infra:deploy:dev:db-migrate`
  - `pnpm infra:deploy:prod:db-migrate`
- Dev deploy:
  - `pnpm cdk:install`
  - `aws sts get-caller-identity` (or set `AWS_PROFILE=latex-admin`)
  - `pnpm cdk:bootstrap:dev`
  - `pnpm infra:image:push:dev` (build and push app image tag)
  - `pnpm infra:db:push:dev` (run schema push in one-off ECS task)
- Prod deploy:
  - `pnpm cdk:bootstrap:prod`
  - `pnpm infra:image:push:prod` (build and push app image tag)
  - `pnpm infra:db:push:prod`

## Ops Docs

- Runtime env contract: `docs/runtime-environment.md`
- Source-host migration runbook: `docs/migration-source-host-runbook.md`
- Production cutover checklist: `docs/cutover-checklist.md`
- Local dev after AWS rollout: `docs/local-development-after-aws.md`
- Security review checklist: `docs/security-review-checklist.md`
- GitHub Actions CD/CD: `docs/cicd-github-actions.md`

## Features

- user accounts & user groups
- per group limits
- albums
- sharing hashed links to images and albums with all metadata stripped
- rad themes
- donation banner

## TODO:

- [ ] alternative 'tiles' layout for 'guest' album view, button to switch between that and current fullwidth layout, and a slider to adjust tile size


### TODO LATERER:

- [ ] TUI

### DONE:

- [x] give album view the same controls / layout as gallery view
- [x] next / prev buttons when viewing image in modal on a gallery / album
- [x] support .gifs
- [x] add github link
- [x] add download button
- [x] ability to rotate images
- [x] ability to edit album display order - drag n drop 'up' / 'down' btns
- [x] ability to rename albums (just click on the title and start typing)
- [x] ability to caption images in an album (caption applies to the image in the context of the image-in-that-album, not to the image, as images can be in more than one album)
- [x] add landon's [ditherspace](https://landonjsmith.com/projects/ditherspace.html) to this app
- [x] encrypted S3 storage
- [x] keyboard shortcuts for img view
- [x] password reset
- [x] support video formats
- [x] support any file format (documents, archives)
- [x] generate previews for documents