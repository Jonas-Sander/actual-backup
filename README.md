> [!WARNING]  
> Make sure that the `@actual-app/api` in `package.json` matches the version running on your actual instace.
> Otherwise importing may fail.

Current supported version: `"@actual-app/api": "26.9.0"`.  
Can be changed via `package.json`.

A tool to automate the export of data of an actual user.  
Exports the data as a zip file containing `db.sqlite` and `metadata.json` files inside the `backup-dir`.  
It can be imported into another Actual instance by closing an open file (if any), then clicking the “Import file” button, then choosing “Actual.” 

### Prerequisites
To run this tool one needs to find out his Sync ID.  
In Actual Budget go to Settings → Show advanced settings → Sync ID.

### Run via nix
```
$ export SERVER_URL="https://my-actual-server.com"
$ export SERVER_PASSWORD="mypw"

$ nix run github:Jonas-Sander/actual-backup -- --sync-id 029b71c3-9a91-42b0-8ac6-8a4650cbf15e --backup-dir backup
```

### Installation:
1. [Install devenv](https://devenv.sh/getting-started/)
2. Run: `$ devenv shell` in the root directory of this project.
3. Change `@actual-app/api` in `package.json` to the version of your instance and run `npm install`.

### Dev Usage
```shell
$ export SERVER_URL="https://my-actual-server.com"
$ export SERVER_PASSWORD="mypw"

$ npm run dev -- --sync-id 029b71c3-9a91-42b0-8ac6-8a4650cbf15e --backup-dir backup

$ ls backup
'2025-04-08 My-Finances-7a1809d.zip'
```

### Updating actual version

#### Fully automated (recommended)
Run the automated update script:
```bash
./update.sh
```
Or via npm:
```bash
npm run update-actual
```

This will automatically:
1. Detect the latest `@actual-app/api` release from the npm registry.
2. Create and switch to a dedicated branch (`update-to-actual-<version>`).
3. Update `package.json`, `package-lock.json`, [`actual-backup.nix`](actual-backup.nix), and [`README.md`](README.md).
4. Compute the exact `npmDepsHash` using `prefetch-npm-deps`.
5. Verify that the package builds cleanly with `nix build`.
6. Commit the changes and open a GitHub Pull Request via `gh`.

**Options:**
- `./update.sh [version]`: Update to an explicit version instead of the latest npm version.
- `./update.sh --no-commit`: Apply updates, recalculate hash, test nix build, but leave files uncommitted.
- `./update.sh --no-pr`: Apply updates, recalculate hash, test nix build, and commit locally without pushing or creating a PR.
- `./update.sh --check`: Check if an update is available without making changes.
- `./update.sh --dry-run`: Preview changes without modifying files.
