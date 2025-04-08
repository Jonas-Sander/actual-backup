> [!WARNING]  
> Make sure that the `@actual-app/api` in `package.json` matches the version running on your actual instace.
> Otherwise importing will fail.

Current supported version: `"@actual-app/api": "25.3.1"`.  
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