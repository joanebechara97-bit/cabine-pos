# Simple Web-based POS System

This small application provides a basic point-of-sale interface with the following features:

- Login page (hard-coded username/password)
- POS page with buttons:
  - WD Adults $20
  - WD Kids $10
  - WE Adults $25
  - WE Kids $10
- Daily and monthly reports showing date, category, amount, and total
- Print support (uses browser `window.print()`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open http://localhost:3000 in your browser.

## Credentials

- Username: `admin`
- Password: `password`

## Data Storage

Transactions are stored in `db.json` using `lowdb`. You can clear or edit it manually.


## Notes

This is a minimal prototype and not intended for production use. It uses a simple in-memory/JSON store and has no security features beyond a basic session.

Printing support is provided by the browser's print dialog; ensure your printer is configured locally.

## Deployment

You can deploy this Node/Express app to most cloud hosts. Quick options:

- **Render (recommended):** create a GitHub repo, push this project, then create a Web Service on Render connected to the repo. Build command `npm install`, Start command `npm start`.
- **Heroku:** ensure `Procfile` exists (this repo includes one). `heroku create`, then `git push heroku main`.
- **Railway:** create a project from GitHub; Railway will detect `npm start`.

Notes:
- For production, move your logo files into `public/images/` and update templates to `/images/...` for conventional static serving. You can also keep them in project root as currently served at `/assets/...`.
- Ensure you push the repo to GitHub and set any environment variables (the app reads `PORT`).

If you want, I can help create a Git repo here and guide you through connecting to Render/Heroku and performing the first deploy.