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

        # Read the application version dynamically from package.json
        appVersion = (builtins.fromJSON (builtins.readFile ./package.json)).version;
      in
      {
        packages.actual-backup = pkgs.buildNpmPackage {
          pname = "actual-backup-tool";
          version = appVersion;

          src = ./.;

          # Hash of the node_modules structure based on package-lock.json.
          # Ensures reproducible dependency fetching.
          # If dependencies change (package-lock.json updated), `nix build` will fail
          # with a hash mismatch, providing the correct hash to paste here.
          npmDepsHash = "sha256-HaOhKSfkFC4PAvOhMbkKK4M3kS/vY559I9vv6bQRT2Q=";
          # npmDepsHash = pkgs.lib.fakeHash;

          # Allow build scripts to write to the npm cache if needed.
          makeCacheWritable = true;

          # Specify the build script from package.json ("scripts": { "build": "tsc" })
          npmBuildScript = "build";

          # --- Build-time Dependencies ---
          # Packages needed ONLY on the build machine to build the application.
          # They are *not* included in the final runtime closure unless also in buildInputs.
          nativeBuildInputs = [
            pkgs.nodejs # Needed for npm/node commands during build
            pkgs.nodePackages.typescript # Needed for the `tsc` command during the build script
          ];
          # --- Runtime Dependencies ---
          # Packages needed by the application when it runs.
          buildInputs = [
            pkgs.nodejs # Node.js runtime is required to execute the compiled JS
            pkgs.sqlite # Needed for the sqlite3 npm package used in tests
          ];

          # Disable the default npm install command provided by buildNpmPackage.
          # We handle the installation process manually in installPhase for more control.
          dontNpmInstall = true;

          # Custom installation script run after the build step.
          # This phase copies the necessary built artifacts into the Nix store ($out).
          installPhase = ''
            # Run standard pre-installation hooks
            runHook preInstall

            # Create the directory structure within the output path ($out)
            # - $out/libexec/actual-backup: Holds the application code and node_modules
            # - $out/bin: Holds the executable wrapper script
            mkdir -p $out/libexec/actual-backup $out/bin

            # Copy the compiled JavaScript code from the build step (`tsc` output)
            echo "Copying compiled dist directory..."
            cp -R ./dist $out/libexec/actual-backup/

            # Copy the node_modules directory prepared by buildNpmPackage's internal steps.
            # This directory contains ALL dependencies (including devDependencies) because
            # NODE_ENV was not set to production *before* the build step, allowing `tsc`
            # (a devDependency) and its types (`@types/node`) to be found.
            echo "Copying prepared node_modules directory..."
            cp -R ./node_modules $out/libexec/actual-backup/

            # Copy package.json into the libexec dir. This might be needed if the
            # application reads its own version at runtime (e.g., for a --version flag).
            # If not needed, this copy can be removed.
            cp ./package.json $out/libexec/actual-backup/

            # Create the executable wrapper script.
            # `substitute` replaces placeholders in `./wrapper.sh` with Nix store paths.
            echo "Creating wrapper script..."
            substitute ${./wrapper.sh} $out/bin/actual-backup \
              --subst-var-by nodejs_bin_path ${pkgs.nodejs}/bin/node \
              --subst-var-by app_root $out/libexec/actual-backup \
              --subst-var-by entry_point dist/backup-tool.js # Specify the main JS file

            # Make the wrapper script executable
            chmod +x $out/bin/actual-backup

            # Run standard post-installation hooks
            runHook postInstall
          '';

          # Enable and define the check phase for running tests
          doCheck = true;
          checkPhase = ''
            runHook preCheck

            # Set HOME to a writable directory in the sandbox, as some npm packages or tests might need it.
            export HOME=$(mktemp -d)

            echo "Running 'npm test' in checkPhase..."
            echo "Warning: The test suite ('src/backup-tool.test.ts') is designed to connect to an Actual server instance."
            echo "This server is typically started by 'devenv up' and available at http://localhost:3001."
            echo "In the sandboxed Nix build environment, this server will not be available."
            echo "Therefore, the tests are expected to fail during the checkPhase due to connection errors."
            echo "The purpose of this checkPhase is to demonstrate test integration structure."
            
            # Attempt to run the tests. The test script itself has defaults for server URL and password
            # (http://localhost:3001 and 'testpassword') if environment variables are not set.
            # These will attempt to connect to a non-existent server in the sandbox.
            npm test

            runHook postCheck
          '';

          # Metadata associated with the package
          meta = with pkgs.lib; {
            description = "A tool to backup Actual Budget data via the API";
            homepage = "https://github.com/Jonas-Sander/actual-backup";
            license = licenses.mit;
            maintainers = [
              "Jonas-Sander"
            ];
            platforms = platforms.linux ++ platforms.darwin;
          };
        };

        # Default package: `nix build .` will build this package
        packages.default = self.packages.${system}.actual-backup;

        # Define runnable applications provided by the flake
        apps.actual-backup = {
          type = "app"; # Standard type for runnable applications
          # The command to execute when running `nix run .#actual-backup`
          program = "${self.packages.${system}.actual-backup}/bin/actual-backup";
        };

        # Default application: `nix run .` will run this application
        apps.default = self.apps.${system}.actual-backup;
      }
    );
}
