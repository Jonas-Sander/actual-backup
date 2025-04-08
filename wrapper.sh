#!/usr/bin/env bash

# Wrapper script for actual-backup-tool (NO CD version)

# Variables substituted by Nix during build:
# nodejs_bin_path -> path to node binary
# app_root        -> path to libexec directory where code and node_modules reside
# entry_point     -> relative path to the main JS file within app_root

# Construct the absolute path to the entry point script within the Nix store
entry_point_abs="@app_root@/@entry_point@"

# Execute the Node.js script using its ABSOLUTE path, passing all arguments ($@).
# The Current Working Directory remains the one where 'nix run' was invoked.
# Node.js will find 'node_modules' relative to the location of '$entry_point_abs'.
exec "@nodejs_bin_path@" "$entry_point_abs" "$@"