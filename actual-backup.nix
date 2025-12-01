{
  buildNpmPackage,
  lib,
  nodePackages,
  typescript ? nodePackages.typescript,
  nodejs,
  version ? "25.11.0",
  # Hash of the node_modules structure based on package-lock.json.
  # Ensures reproducible dependency fetching.
  # If dependencies change (package-lock.json updated), `nix build` will fail
  # with a hash mismatch, providing the correct hash to paste here.
  npmDepsHash ? "sha256-YwjUaOIA1Hk59rUYkC+yNrWtPZ2dkb6YGTDq8BSkd14=",
  # npmDepsHash ? lib.fakeHash,
  ...
}:
buildNpmPackage {
  pname = "actual-backup-tool";

  inherit version npmDepsHash;

  src = ./.;

  # Allow build scripts to write to the npm cache if needed.
  makeCacheWritable = true;

  # Specify the build script from package.json ("scripts": { "build": "tsc" })
  npmBuildScript = "build";

  # --- Build-time Dependencies ---
  # Packages needed ONLY on the build machine to build the application.
  # They are *not* included in the final runtime closure unless also in buildInputs.
  nativeBuildInputs = [
    nodejs # Needed for npm/node commands during build
    typescript # Needed for the `tsc` command during the build script
  ];
  # --- Runtime Dependencies ---
  # Packages needed by the application when it runs.
  buildInputs = [
    nodejs # Node.js runtime is required to execute the compiled JS
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
      --subst-var-by nodejs_bin_path ${nodejs}/bin/node \
      --subst-var-by app_root $out/libexec/actual-backup \
      --subst-var-by entry_point dist/backup-tool.js # Specify the main JS file

    # Make the wrapper script executable
    chmod +x $out/bin/actual-backup

    # Run standard post-installation hooks
    runHook postInstall
  '';

  # Metadata associated with the package
  meta = with lib; {
    description = "A tool to backup Actual Budget data via the API";
    homepage = "https://github.com/Jonas-Sander/actual-backup";
    license = licenses.mit;
    maintainers = [
      "Jonas-Sander"
    ];

    mainProgram = "actual-backup";

    platforms = platforms.linux ++ platforms.darwin;
  };
}
