# START-HERE.md — opening a new chat for Shop tools

## How to start a new chat

1. Attach **AI_CONTEXT.md** and this file.
2. Attach a zip of the project **without** `node_modules`, `.next` and `.env.local`.
3. Paste the message below. Change the task line if you want something other than the next batch.

```
I'm continuing my project "Shop tools" (Next.js 16, JavaScript only, Drizzle + Neon, Better Auth).
AI_CONTEXT.md is the full context. Follow it exactly, especially section 1 (how I work) and section 2 (golden rules).
The attached zip is my current project; treat it as the source of truth.

Task: next batch — see the batch plan in AI_CONTEXT.md §9.
(Or replace this line with: <your task>)

Before writing code: check the zip matches AI_CONTEXT.md, list the files you'll create/change, packages, env vars,
and whether I need `npm run db:push`. Ask any decision you need in one short message.

When done: separate files (path comment on line 1, where each goes, NEW or replace), numbered setup steps,
and the Progress-log row for AI_CONTEXT.md.
```

## First-time setup (Windows, PowerShell)

1. Install **Node.js 20.9 or newer** (nodejs.org → LTS).
2. Create a free **Neon** project (neon.tech), region **Singapore** (closest to Bangladesh). Copy the **pooled** connection string.
3. In the project folder:
   ```powershell
   npm install
   copy .env.example .env.local
   ```
4. Open `.env.local` and fill in `DATABASE_URL` (the Neon string), `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000` for now) and
   `AUTH_SECRET` (any 32+ random characters).
5. ```powershell
   npm run db:push
   npm run user:add -- --email you@yourshop.com --password "a strong password" --name "Your Name" --owner
   npm run dev
   ```
6. Open http://localhost:3000, sign in, then go to **Settings › Shop details** and enter your shop's name, phone and address.
   Add your operators in **Settings › Team**, and your services and rates in **Accounts › Price list**.

## If something breaks

- **"An Application Control policy has blocked this file" / "Turbopack is not supported on this platform":** Windows Smart App
  Control is blocking Next.js's compiler. Turn it off: Windows Security → App & browser control → Smart App Control settings →
  Off. Then run `Remove-Item -Recurse -Force .next; npm run dev`.
- **"Module not found":** a file is missing. Zip the project (no `node_modules`/`.next`/`.env.local`) and ask the AI to compare.
- **"relation … does not exist" / an Accounts page shows an error:** run `npm run db:push` (new tables), then restart.
- **Locked out:** `npm run user:add -- --email you@x.com --password "new password" --owner`.
- **PDF pages don't show, "Couldn't load the PDF password engine", the typing engine or image-to-text doesn't start:** run
  `npm run vendor` (copies those files into `public/vendor`), then restart `npm run dev`.
- **Auto passport / Remove background says "Couldn't load the photo AI files" or "background-removal files":** run
  `npm run vendor`, then restart `npm run dev`. The first photo after opening the page takes a few seconds longer (the AI loads once).
- **The auto photo picked the wrong face or cut the head badly:** click **Adjust** on that photo (drag/zoom), or **Crop by hand**.
  Best results: one person, face clear and not tiny, plain background, a little space above the head.
- **Printed photos are the wrong size:** in the print dialog choose **Actual size / 100%** and margins **None** (not "Fit to page").
- After changing files, stop `npm run dev` (Ctrl+C) and start it again.
