{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  # https://devenv.sh/basics/
  env.GREET = "devenv";

  # https://devenv.sh/packages/
  packages = [
    pkgs.git
    pkgs.actual-server
  ];

  # https://devenv.sh/languages/
  languages.javascript = {
    enable = true;
    npm = {
      enable = true;
      install.enable = true;
    };
  };

  # https://devenv.sh/processes/
  processes.actual-server = {
    exec = "actual-server --port 3001 --data-dir $ACTUAL_DATA_DIR";
    env = {
      ACTUAL_SERVER_URL = "http://localhost:3001";
      ACTUAL_SERVER_PASSWORD = "testpassword"; # Consider a more secure way to handle passwords if needed
      ACTUAL_DATA_DIR = "/tmp/actual-data"; # Temporary data location
    };
  };

  # https://devenv.sh/services/
  # services.postgres.enable = true;

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  enterShell = ''
    hello
    git --version
    mkdir -p $ACTUAL_DATA_DIR # Ensure data directory exists
    echo "Actual server starting in the background on port 3001."
    echo "Data directory: $ACTUAL_DATA_DIR"
    echo "URL: $ACTUAL_SERVER_URL"
    echo "Password: $ACTUAL_SERVER_PASSWORD"
  '';

  # https://devenv.sh/tasks/
  # tasks = {
  #   "myproj:setup".exec = "mytool build";
  #   "devenv:enterShell".after = [ "myproj:setup" ];
  # };

  # https://devenv.sh/tests/
  enterTest = ''
    echo "Running tests"
    git --version | grep --color=auto "${pkgs.git.version}"
  '';

  # https://devenv.sh/pre-commit-hooks/
  # pre-commit.hooks.shellcheck.enable = true;

  # See full reference at https://devenv.sh/reference/options/
}
