> [!WARNING]  
> Make sure that the `@actual-app/api` in `package.json` matches the version running on your actual instace.
> Otherwise importing may fail.

Current supported version: `"@actual-app/api": "25.7.1"`.  
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
1. Update actual version in `README.md`, `package.json` and `actual-backup.nix` (e.g. `25.4.0` to `25.5.0`).
2. Run `devenv shell`
3. Run `npm install` to update the package.lock file (otherwise `nix build` won't work)
4. Replace `npmDepsHash ? "sha256-ZTfXjTZE5f...";` in `actual-backup.nix` with `npmDepsHash ? lib.fakeHash;`
5. Run `nix build` and copy the `got:    sha256-HaOhKSfkFC4PAvO...`
6. Replace `npmDepsHash ? lib.fakeHash;` with the new hash (i.e. `npmDepsHash ? "sha256-HaOhKSfkFC4PAvO...";`).
7. Run `nix build` again. It should now succeed.
8. Test changes.
9. If it works, commit the change or open a PR.
