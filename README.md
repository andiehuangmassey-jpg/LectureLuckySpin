# LectureLuckySpin

Static GitHub Pages app for classroom random selection.

## Features

- Load students from a CSV with `First Name`, `Last Name`, `ID Number`, `Email Address`
- Draw 10 random students with a reveal animation
- Spin again inside those 10 students to choose the next speaker
- Mark answers as correct or wrong in a dialog
- Maintain a `bonus` column and increment it on each correct answer
- Download the updated CSV locally
- Optionally sync the updated CSV back to GitHub with a personal access token

## Files

- `index.html`: app structure
- `styles.css`: Morandi-inspired UI
- `app.js`: CSV parsing, draw logic, spin logic, and GitHub sync
- `students.csv`: example roster
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow

## CSV format

```csv
First Name,Last Name,ID Number,Email Address
Ada,Lovelace,2026001,ada@example.edu
```

If `bonus` is missing, the app adds it automatically and starts from `0`.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. In GitHub, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or run the `Deploy GitHub Pages` workflow manually.

The site will be published at:

`https://<your-github-username>.github.io/LectureLuckySpin/`

## GitHub write-back

GitHub Pages is static, so the browser cannot directly edit server files unless you use the GitHub API.

To sync `bonus` back into `students.csv` from the site:

1. Create a fine-grained personal access token with `Contents: Read and write`.
2. Fill `Owner`, `Repo`, `Branch`, `CSV Path`, and `Token` in the app.
3. Mark a student as correct, or press `Sync to GitHub`.

The token stays in the browser session only.
