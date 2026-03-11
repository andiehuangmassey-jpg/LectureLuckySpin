# LectureLuckySpin

Static GitHub Pages app for classroom random selection.

The privacy-safe deployment mode is: publish the page publicly, but do not commit any real roster into the repo. The teacher loads the CSV locally in the browser for each session.

## Features

- Load students from a local CSV with `First Name`, `Last Name`, `ID Number`, `Email Address`
- Draw 10 random students with a reveal animation
- Spin again inside those 10 students to choose the next speaker
- Mark answers as correct or wrong in a dialog
- Maintain a `bonus` column and increment it on each correct answer
- Download the updated CSV locally

## Files

- `index.html`: app structure
- `styles.css`: Morandi-inspired UI
- `app.js`: CSV parsing, draw logic, spin logic, and local file loading
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow

## CSV format

```csv
First Name,Last Name,ID Number,Email Address
Ada,Lovelace,2026001,ada@example.edu
```

If `bonus` is missing, the app adds it automatically and starts from `0`.

## Privacy model

- Do not store real student data in this repository.
- Publish the app normally on GitHub Pages.
- At runtime, click `Load CSV` and select the roster from the teacher's computer.
- The roster is kept in the current browser session only unless the teacher downloads an updated CSV manually.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. In GitHub, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or run the `Deploy GitHub Pages` workflow manually.

The site will be published at:

`https://<your-github-username>.github.io/LectureLuckySpin/`
