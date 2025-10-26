{
  description = "Actual Budget Backup Tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
      ... # Allows for potential future inputs
    }:
    let
      inherit (nixpkgs) lib;

      supportedSystems = [
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];

      forAllSystems =
        function: lib.genAttrs supportedSystems (system: function nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs: rec {
        actual-backup = pkgs.callPackage ./actual-backup.nix { };
        # Default package: `nix build .` will build this package
        default = actual-backup;
      });

      # Define runnable applications provided by the flake
      apps = forAllSystems (pkgs: rec {
        actual-backup = {
          type = "app"; # Standard type for runnable applications
          # The command to execute when running `nix run .#actual-backup`
          program = lib.getExe self.packages.${pkgs.system}.actual-backup;
        };

        default = actual-backup;
      });

    };
}
