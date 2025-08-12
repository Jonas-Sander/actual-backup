let
  makeVersion = version: dependencyDir: {
    name = version;
    value = {
      inherit dependencyDir;
    };
  };

  makeCurrentVersion = version: makeVersion version ".";
  makeOldVersion = version: makeVersion version "./versions/${version}";
in
builtins.listToAttrs [
  (makeCurrentVersion "25.7.1")
  (makeOldVersion "25.6.1")
  (makeOldVersion "25.5.0")
  (makeOldVersion "25.4.0")
]
