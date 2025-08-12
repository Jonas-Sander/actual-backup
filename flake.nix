{
  description = "Actual Budget Backup Tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # flake-utils: Provides helper functions to define outputs for multiple systems easily.
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ... # Allows for potential future inputs
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;

        versionInfo = import ./versions.nix;
        availableVersions = lib.attrNames versionInfo;

        actual-backup = pkgs.callPackage ./actual-backup.nix { };

        getVersionInfo =
          version:
          if lib.asserts.assertOneOf "actual-backup version" version availableVersions then
            versionInfo.${version}
          else
            null;

        forVersion =
          version:
          actual-backup.override {
            inherit version;
            inherit (getVersionInfo version) npmDepsHash dependencyDir;
          };

        forActualServer = actual-server: forVersion actual-server.version;
        forNixpkgsActualServer = forActualServer pkgs.actual-server;
      in
      {
        packages.actual-backup = {
          defalut = actual-backup;
          inherit forVersion forActualServer forNixpkgsActualServer;
        }
        // lib.mapAttrs (n: v: forVersion n) versionInfo;

        # Default package: `nix build .` will build this package
        packages.default = actual-backup;

        # Define runnable applications provided by the flake
        apps.actual-backup = {
          type = "app"; # Standard type for runnable applications
          # The command to execute when running `nix run .#actual-backup`
          program = "${actual-backup}/bin/actual-backup";
        };

        # Default application: `nix run .` will run this application
        apps.default = {
          type = "app";
          program = "${actual-backup}/bin/actual-backup";
        };
      }
    );
}
