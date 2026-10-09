# Poll backend (erhun.me/poll)

The poll pages are static, so responses and invites go through this small Google Apps Script web app.
It stores everything in a Google Sheet and sends invites from your Google Calendar.
Jekyll does not publish this folder (see `exclude` in `_config.yml`).

## One-time setup (about 10 minutes)

Use the Google account whose calendar should send the invites.

1. Go to <https://script.google.com> and click **New project**. Name it `erhun.me poll`.
2. Open **Project Settings** (gear icon) and tick **Show "appsscript.json" manifest file in editor**.
3. Back in the **Editor**, replace the contents of `Code.gs` with `poll-backend/Code.gs`, and the contents of `appsscript.json` with `poll-backend/appsscript.json`. Save.
4. In the toolbar, choose the function `setup` and click **Run**. Approve the permissions.
   Google shows "Google hasn't verified this app" because it is your own script: click **Advanced**, then **Go to erhun.me poll**.
5. The execution log shows `Admin key: …`. Keep this key; you sign in to the admin page with it.
6. Click **Deploy → New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Copy the **Web app URL** (it ends with `/exec`).
7. In `_config.yml`, set `poll_api: "<the Web app URL>"`, then commit and push.
8. Open <https://erhun.me/poll/admin/> and sign in with the admin key.

## Day to day

- **New poll:** erhun.me/poll/admin/ → New poll → add weekly slots → Create poll → copy the share link.
- **Remove a response:** click **Delete** under the person's name in the responses table.
- **Invite people:** pick a slot under *Send a calendar invite*. Everyone available is pre-selected; untick or add guests, set the first date, duration, location, repeat and Meet link, then **Send invites**.
- **Change a meeting:** **Edit** on the meeting card. Saving updates the calendar event and emails the change to all guests. **Cancel meeting** deletes it and notifies them.

All data is in the spreadsheet **erhun.me poll data** in your Google Drive.

## Maintenance

- **Updating the code:** paste the new `Code.gs`, then **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This keeps the same URL.
- **New admin key:** in **Project Settings → Script properties**, delete `ADMIN_KEY`, then run `setup` again.
