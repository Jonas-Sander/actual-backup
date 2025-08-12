# actual-backup

A tool to automate the export of data of an actual user.  
Exports the data as a zip file containing `db.sqlite` and `metadata.json` files inside the `backup-dir`.  
It can be imported into another Actual instance by closing an open file (if any), then clicking the “Import file” button, then choosing “Actual.” 

## Versioning

> [!WARNING]  
> Make sure that the version matches the version running on your actual instace.
> Otherwise **importing** may fail, while exporting succeeds silently.

The default version is `27.7.1`.
It is the default package, but can also be accessed at `actual-backup`.
This is not recommended, as if there is a version mismatch between `actual-server` and `actual-backup`,
it might export successfuly while not allowing the backups to be imported (until an upgrade).

Older available versions can be checked at [`versions.nix`](./versions.nix).
To get a version matching an actual-server package,
`actual-backup.forActualServer pkgs.actual-server`
can be used to pin it to the version of that actual-server.
Another option is `actual-backup.forNixpkgsActualServer`,
but only if you override this flake's `nixpkgs` input to follow another flake's
(for example in a NixOS configuration).

For specific versions not pinned to the package,
`actual-backup.forVersion "25.6.1"`
and `actual-backup."25.6.1"`
are available.

For all cases, it will fail if the version is not available with a sane error message.

Note that not all versions will be supported forever.
If the source code needs to change,
for example because of a breaking change in the API,
older versions are not guaranteed to work and might be removed.
But if you track the `actual-server` version, the rebuild will fail.
If that happens, you can 
[pin the flake to a previous commit](https://nix.dev/manual/nix/2.28/command-ref/new-cli/nix3-flake.html#examples).

 ## Prerequisites
To run this tool one needs to find out his Sync ID.  
In Actual Budget go to Settings → Show advanced settings → Sync ID.

## Usage

### Run via nix
```
$ export SERVER_URL="https://my-actual-server.com"
$ export SERVER_PASSWORD="mypw"

$ nix run github:Jonas-Sander/actual-backup -- --sync-id 029b71c3-9a91-42b0-8ac6-8a4650cbf15e --backup-dir backup
$ nix run 'github:Jonas-Sander/actual-backup#actual-backup."25.6.1"' -- --sync-id 029b71c3-9a91-42b0-8ac6-8a4650cbf15e --backup-dir backup # for a specific version
```

## Development

### Dev Usage
```shell
$ export SERVER_URL="https://my-actual-server.com"
$ export SERVER_PASSWORD="mypw"
$ export NODE_EXTRA_CA_CERTS=/path/to/selfsigned/cert # If you have self-signed SSL certificates

$ npm run dev -- --sync-id 029b71c3-9a91-42b0-8ac6-8a4650cbf15e --backup-dir backup

$ ls backup
'2025-04-08 My-Finances-7a1809d.zip'
```

### Updating actual version

#### Archiving the old version
1. Copy actual `package.json` and `package-lock.json` to `versions/<version>` (e.g. `versions/25.7.1`).
2. Go into `versions.nix` and modify the current version's entry from `makeCurrentVersion` to `makeOldVersion`.
3. Test the old version by staging the files and running `nix build '.#actual-backup."<version>"'` (e.g. `nix build -L '.#actual-backup."25.7.1"'`)
  Afterwards, you may use `cat result/libexec/actual-backup/node_modules/@actual-app/api/package.json` to verify that it uses the expected version of the package.

#### Creating a new version
1. In `versions.nix`, add a new version at the top of the file with `makeCurrentVersion`.
2. Update actual version in `README.md` and `package.json` (e.g. `25.7.1` to `25.8.0`).
3. In `actual-backup.nix`, update the second part of the version number (e.g. `1.0.0-25.7.1` to `1.0.0-25.8.0`)
4. Run `devenv shell`
5. Run `npm install` to update the package.lock file (otherwise `nix build` won't work)
6. Test the version with `nix run`.
7. If it works, commit the change or open a PR.

Note that the old versions are only guaranteed to work as long as the source code does not change.
If the source code is changed, all versions should be tested
(or abandoned, as a previous commit can be used for the flake input if needed).
If changes to the source code are made, the first part of the version number needs to be updated in `actual-backup.nix` and `flake.nix`
(e.g. `1.0.0-25.7.1` to `1.1.0-25.8.0`)
