# CMS-PPA

Credentials Management System for the Philippine Ports Authority.

CMS-PPA is the internal site for storing credentials of PPA systems, seeing whether production sites are reachable, and reviewing audit activity. This repository is the browser interface. It talks to the Laravel JSON API in `cms-ppa-backend`.

## What you can do

- **Dashboard.** Production systems are shown as up, down, or not yet checked. Administrators also see recent sign-ins. The page reads saved check results; it does not contact the monitored systems itself.
- **Credentials.** Register a system as production, test, or legacy, and keep its remote access (AnyDesk, RustDesk, RDP, SSH) plus related account details. Passwords and notes are stored encrypted by the API and are not included in search or in remote-desk launch links.
- **Systems audit trail.** A read-only copy of recent activity from UAMS, CMIS, and PPIS. Those databases are only read. A source that cannot be reached leaves the copy already saved in place.
- **CMS audit trail.** What people did inside CMS-PPA: sign-ins and sign-outs, credential changes, remote desk opens, and user account changes. The person's name stays on the record if the account is later removed.
- **Users.** Administrators register accounts, update them, reset another user's password, and enable or disable accounts.
- **Notifications.** Accounts are told when a production website goes down or comes back up.

## Who can see what

| | Administrator | User |
| --- | --- | --- |
| Dashboard system status | Yes | Yes |
| Credentials | Yes | Yes |
| Recent sign-ins | Yes | No |
| Systems audit trail | Yes | No |
| CMS audit trail | Yes | No |
| User accounts | Yes | No |

Disabled accounts cannot sign in.

## How the pieces fit

Pages live in `pages/`. TypeScript in `ts/` is compiled to `js/`. `index.html` sends a signed-in session to the dashboard and everyone else to sign-in.

`js/config.js` sets the API address:

```js
window.CMS_API_BASE = "http://localhost/cms-ppa-backend/public/api";
```

Sign-in stores a bearer token in the browser session. The API checks that token on later requests.

The API scheduler checks production reachability every minute (only systems that are due) and copies audit rows from UAMS, CMIS, and PPIS every fifteen minutes. Timestamps are stored in UTC and shown in Asia/Manila.

## Run it locally

1. Run the API from `cms-ppa-backend` and create the first account with `php artisan cms:create-user`.
2. Point `js/config.js` at that API.
3. Serve this folder from a web server, for example `http://localhost/cms-ppa/`.

After editing files in `ts/`, compile them:

```bash
npm install
npm run build:ts
```
