This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Journal Alert Integration

Journal alert automation is now integrated in this repository.

- Trigger endpoint: `POST /api/notion/journal/alert/run?days=7`
- Auth header: `Authorization: Bearer <JOURNAL_ALERT_RUN_TOKEN>`
- Pipeline: PubMed fetch -> dedupe against Notion journal DB -> insert new papers -> optional email notify

Required environment variables:

- `NOTION_TOKEN`
- `NOTION_JOURNAL_DB_ID`
- `JOURNAL_ALERT_RUN_TOKEN`

Optional email variables (email step runs only when all are set):

- `JOURNAL_ALERT_SMTP_USER`
- `JOURNAL_ALERT_SMTP_PASS`
- `JOURNAL_ALERT_SMTP_HOST` (default: `smtp.gmail.com`)
- `JOURNAL_ALERT_SMTP_PORT` (default: `587`)
- `JOURNAL_ALERT_RECIPIENT` (default: SMTP user)
- `JOURNAL_ALERT_MAX_EMAIL_ITEMS` (default: `80`, hard cap `200`)
- `JOURNAL_ALERT_EMAIL_COOLDOWN_HOURS` (default: `72`)

Legacy note:

- `workspace/myagents/journal-alert` is now legacy. Use dashboard API run endpoint as the single execution path.
