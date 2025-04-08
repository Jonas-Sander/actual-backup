Usage:

```
$ export SERVER_URL="https://my-actual-server.com"
$ export SERVER_PASSWORD="mypw"

# WARNING: This will remove existing files in my-backup-dir, as existing corrupt
# files might cause the backup process to fail. 
npm run dev -- --sync-id 029b71c3-9a91-42b0-8ac6-5f4650cbf15e --backup-dir my-backup-dir 
```