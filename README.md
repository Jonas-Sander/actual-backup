> [!WARNING]  
> Make sure that the `@actual-app/api` in `package.json` matches the version running on your actual instace.
> Otherwise importing will fail.

Current supported version: `"@actual-app/api": "25.5.0"`.  
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
1. Update actual version in `README.md` and `package.json` (e.g. `25.4.0` to `25.5.0`).
2. Run `devenv shell`
3. Run `npm install` to update the package.lock file (otherwise `nix build` won't work)
4. Replace `npmDepsHash = "sha256-ZTfXjTZE5f...";` in `flake.nix` with `npmDepsHash = pkgs.lib.fakeHash;`
5. Run `nix build` and copy the `got:    sha256-HaOhKSfkFC4PAvO...`
6. Replace `npmDepsHash = pkgs.lib.fakeHash;` with the new hash (i.e. `npmDepsHash = "sha256-HaOhKSfkFC4PAvO...";`).
7. Run `nix build` again. It should now succeed.
8. Test changes.
9. If it works, commit the change or open a PR.

## Running Tests

The automated tests verify the backup tool's functionality by creating a test Actual Budget instance, populating it with data, running the backup tool, and then analyzing the backup to ensure data integrity.

### Prerequisites

1.  **Nix Development Environment:** Ensure you are in the Nix development shell. You can enter it by running:
    ```bash
    nix develop
    # or
    devenv shell
    ```
2.  **Test Actual Server:** The tests require an instance of the Actual server to be running.
    *   If you are using `devenv`, the server is configured to start automatically when you run `devenv up` or when you enter the shell using `devenv shell` (or `nix develop`). This is managed by the `processes.actual-server` definition and `enterShell` script in `devenv.nix`.
    *   The server will be available at `http://localhost:3001` and use the password `testpassword`, as defined by `ACTUAL_SERVER_URL` and `ACTUAL_SERVER_PASSWORD` in `devenv.nix`.
    *   Test data for the server is stored in `/tmp/actual-data` (or the path specified by `ACTUAL_DATA_DIR` in `devenv.nix`). The test script itself also uses a temporary sub-directory (`test-setup-temp-data`) within this for its client-side API cache, which it cleans up.

### Executing Tests

Once the development environment is active and the test server is running, you can execute the tests using npm:

```bash
npm test
```

This command will:
1.  Build the `actual-backup-tool` (compile TypeScript via `npm run build`).
2.  Run the test suite located in `src/backup-tool.test.ts` using `ts-node`.

The test suite (`src/backup-tool.test.ts`) will:
*   Connect to the test Actual server using the credentials and URL defined in `devenv.nix` (and picked up by the test script from environment variables).
*   Create a new temporary budget file (e.g., `TestBudgetForBackupTool.actual`) on the server for the test run.
*   Populate this budget with sample accounts, categories, and transactions using the Actual API.
*   Execute the backup tool (`src/backup-tool.ts`) against this test budget, instructing it to save the backup to a temporary directory.
*   Extract the contents of the generated backup ZIP file.
*   Verify the integrity of the backup by:
    *   Checking for the presence of `db.sqlite` and `metadata.json`.
    *   Querying the SQLite database (`db.sqlite`) to ensure the sample accounts, categories, and transactions are present and correct.
*   Clean up temporary files and directories created during the test (e.g., the backup zip, its extracted contents, and the client-side API session data).