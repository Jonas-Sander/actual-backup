# flake.nix
{
  description = "Actual Budget Backup Tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        appVersion = (builtins.fromJSON (builtins.readFile ./package.json)).version;
      in
      {
        packages.actual-backup = pkgs.buildNpmPackage {
          pname = "actual-backup-tool";
          version = appVersion;
          src = ./.;

          npmDepsHash = "sha256-u6gQduJn1vKtMGURckL1SwKfQNoe25xyrNa4EwNJTwg=";

          makeCacheWritable = true;
          # NODE_ENV not set here, allows devDeps for build

          npmBuildScript = "build";

          nativeBuildInputs = [
            pkgs.nodejs
            pkgs.nodePackages.typescript
          ];
          buildInputs = [ pkgs.nodejs ];

          # We still prevent the default npm install step because buildNpmPackage
          # might try to install globally, we want it locally in node_modules
          # and we copy it manually later.
          dontNpmInstall = true;

          # buildNpmPackage runs its internal dependency fetching based on
          # package-lock.json before this phase, creating a node_modules dir.
          # The `npm run build` (tsc) uses this node_modules.

          installPhase = ''
            runHook preInstall
            mkdir -p $out/libexec/actual-backup $out/bin

            echo "Copying compiled dist directory..."
            cp -R ./dist $out/libexec/actual-backup/

            echo "Copying prepared node_modules directory..."
            # Option A: Copy everything (includes devDeps)
            cp -R ./node_modules $out/libexec/actual-backup/
            # Option B: Prune after copying (use if needed)
            # (cd $out/libexec/actual-backup && npm prune --omit=dev)

            cp ./package.json $out/libexec/actual-backup/

            echo "Creating wrapper script..."
            substitute ${./wrapper.sh} $out/bin/actual-backup \
              --subst-var-by nodejs_bin_path ${pkgs.nodejs}/bin/node \
              --subst-var-by app_root $out/libexec/actual-backup \
              --subst-var-by entry_point dist/backup-tool.js # <--- FIX IS HERE (changed --subst-var to --subst-var-by)

            chmod +x $out/bin/actual-backup

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "A tool to backup Actual Budget data via the API";
            homepage = "https://github.com/Jonas-Sander/actual-backup";
            license = licenses.mit; # CHANGE TO YOUR ACTUAL LICENSE if not MIT
            maintainers = with maintainers; [ ]; # Add your handle
            platforms = platforms.linux ++ platforms.darwin;
          };
        };

        packages.default = self.packages.${system}.actual-backup;

        apps.actual-backup = {
          type = "app";
          program = "${self.packages.${system}.actual-backup}/bin/actual-backup";
        };
        apps.default = self.apps.${system}.actual-backup;

        devShells.default = pkgs.mkShell {
          inputsFrom = [ self.packages.${system}.actual-backup ];
          packages = with pkgs; [
            nodejs
            nodePackages.typescript
            nodePackages.ts-node
          ];
          shellHook = ''
            echo "Entered development shell for actual-backup."
            export PATH="./node_modules/.bin:$PATH"
          '';
        };
      }
    );
}
