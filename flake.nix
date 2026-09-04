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
        actual-backup = pkgs.callPackage ./actual-backup.nix { 
          # The Node module better_sqlite3 lead to an error when running actual-backup when building with Node 24,
          # so we are using Node 22 instead, even though the latest realease of Actual Budget (v2.6.9) uses Node 24.
          # IDK, its confusing.
          #  [Breadcrumb] { message: 'loaded spreadsheet', category: 'server' }
          #    #  /nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node[262774]: void node::RemoveEnvironmentCleanupHook(v8::Isolate*, CleanupHook, void*) at ../../src/api/hooks.cc:142
          #    #  Assertion failed: (env) != nullptr
          #  ----- Native stack trace -----
          #   1: 0x560cc6575d43 node::Assert(node::AssertionInfo const&) [/nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node]
          #   2: 0x560cc644a42d node::RemoveEnvironmentCleanupHook(v8::Isolate*, void (*)(void*), void*) [/nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node]
          #   3: 0x7ba2c421803a Statement::~Statement() [/nix/store/hxbzax3fpmn6kqpjk430m5wdg9w7fida-actual-backup-tool-26.9.0/libexec/actual-backup/node_modules/better-sqlite3/build/Release/better_sqlite3.node]
          #   4: 0x7ba2c4218211 Statement::~Statement() [/nix/store/hxbzax3fpmn6kqpjk430m5wdg9w7fida-actual-backup-tool-26.9.0/libexec/actual-backup/node_modules/better-sqlite3/build/Release/better_sqlite3.node]
          #   5: 0x560cc6b17373  [/nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node]
          #   6: 0x560cc6bdaa84  [/nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node]
          #   7: 0x560cc6bdbcd1  [/nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node]
          #   8: 0x560cc6be0000  [/nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node]
          #   9: 0x560cc77eefb3  [/nix/store/lfaydgacdyngci7p60s8wwvgdm74fjkx-nodejs-24.19.0/bin/node]
          # See https://actualbudget.org/docs/releases/#2690:
          # This release updated the Node version for our container images to Node 24.
          nodejs = pkgs.nodejs_22;
        };
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
