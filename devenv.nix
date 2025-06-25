{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{

  env = {
    ACTUAL_SERVER_URL = "http://localhost:3001";
    ACTUAL_SERVER_PASSWORD = "testpassword";
    ACTUAL_DATA_DIR = "./test-actual-server-data";
    ACTUAL_PORT = "3001";
    DEBUG_ACTUAL_SERVER_DATADIR = "FROM_DEVENV_NIX_TEST_ACTUAL_SERVER_DATA";
  };
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
    exec = "echo 'ACTUAL_DATA_DIR for exec: $ACTUAL_DATA_DIR' && actual-server --data-dir $ACTUAL_DATA_DIR --port $ACTUAL_PORT";
  };

  enterShell = ''
    mkdir -p $ACTUAL_DATA_DIR # Ensure data directory exists

    echo "To start the Actual server, run: devenv up or devenv up -d"
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
}
