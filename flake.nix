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

        actual-backup = pkgs.callPackage ./actual-backup.nix { };
      in
      {
        packages = {
          inherit actual-backup;
          # Default package: `nix build .` will build this package
          default = actual-backup;
        };

        # Define runnable applications provided by the flake
        apps.actual-backup = {
          type = "app"; # Standard type for runnable applications
          # The command to execute when running `nix run .#actual-backup`
          program = "${actual-backup}/bin/actual-backup";
        };

        # Default application: `nix run .` will run this application
        apps.default = actual-backup;
      }
    );
}
