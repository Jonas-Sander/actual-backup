let
  makeVersion = version: npmDepsHash: dependencyDir: {
    name = version;
    value = {
      inherit npmDepsHash dependencyDir;
    };
  };

  makeCurrentVersion = version: npmDepsHash: makeVersion version npmDepsHash ".";
  makeOldVersion = version: npmDepsHash: makeVersion version npmDepsHash "./versions/${version}";
in
builtins.listToAttrs [
  (makeCurrentVersion "25.7.1" "sha256-AN0comIgRz3fFYu7UV2Mk5d4szrWM5sCLD/AwZsHqRg=")
  (makeOldVersion "25.6.1" "sha256-HaOhKSfkFC4PAvOhMbkKK4M3kS/vY559I9vv6bQRT2Q=")
]
