> [!WARNING]  
> Make sure that the `@actual-app/api` in `package.json` matches the version running on your actual instace.
> Otherwise importing will fail.

Current version: `"@actual-app/api": "25.3.1"`

### Installation:
1. [Install devenv](https://devenv.sh/getting-started/)
2. Run: `$ devenv shell` in the root directory of this project.
3. Change `@actual-app/api` in `package.json` to the version of your instance and run `npm install`.

### Usage
```shell
$ export SERVER_URL="https://my-actual-server.com"
$ export SERVER_PASSWORD="mypw"

# WARNING: This will remove existing files in the backup folder, as existing 
# corrupt files might cause the backup process to fail. 
npm run dev -- --sync-id 029b71c3-9a91-42b0-8ac6-8a4650cbf15e --backup-dir backup
```