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
      forAllSystems =
        function:
        lib.genAttrs [ "x86_64-linux" "x86_64-darwin" "aarch64-linux" "aarch64-darwin" ] (
          system: function nixpkgs.legacyPackages.${system}
        );
    in
    {
      packages = forAllSystems (pkgs: {
        actual-backup = pkgs.callPackage ./actual-backup.nix { };
        # Default package: `nix build .` will build this package
        default = self.packages.${pkgs.system}.actual-backup;
      });

      # Define runnable applications provided by the flake
      apps = forAllSystems (pkgs: {
        default = self.packages.${pkgs.system}.actual-backup;

        actual-backup = {
          type = "app";
          # The command to execute when running `nix run .#actual-backup`
          program = lib.getExe self.packages.${pkgs.system}.actual-backup;
        };
      });
    };
}
