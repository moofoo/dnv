## DNV

Friction-less Node Development in Docker Compose

## Table of Contents

<!-- Start Document Outline -->

-   [Install](#install)
-   [Description](#description)
-   [Basic Usage](#basic-usage)
    -   [Initialize DNV Project](#initialize-dnv-project)
    -   [Run DNV UI](#run-dnv-ui)
-   [DNV CLI commands](#dnv-cli-commands)
    -   [Clear](#clear)
    -   [Config](#config)
    -   [Info](#info)
    -   [Init](#init)
    -   [UI](#ui)
    -   [Up](#up)
    -   [Stop](#stop)
-   [DNV Init Notes](#dnv-init-notes)
    -   [Behavior with existing Dockerfile / docker-compose.yml files](#behavior-with-existing-dockerfile--docker-composeyml-files)
    -   [Initialization options / prompts](#initialization-options--prompts)
        -   [Package Manager](#package-manager)
        -   [External Volume](#external-volume)
        -   [Working Directory](#working-directory)
        -   [Dockerfile Node Image](#dockerfile-node-image)
        -   [Use Node User](#use-node-user)
        -   [Restart containers option](#restart-containers-option)
        -   [Metrics display option (w/ External Volume option)](#metrics-display-option-w-external-volume-option)
        -   [Use alternate node image when DNV starts service (w/ External Volume option)](#use-alternate-node-image-when-dnv-starts-service-w-external-volume-option)
    -   [External Volume option](#external-volume-option)
        -   [What does this mean?](#what-does-this-mean)
        -   [Should I use this?](#should-i-use-this)
    -   [Restarting containers option](#restarting-containers-option)
-   [DNV UI commands](#dnv-ui-commands)
    -   [Action menu](#action-menu)
    -   [bash / sh](#bash--sh)
    -   [exec](#exec)
    -   [repl](#repl)
    -   [scripts](#scripts)
    -   [metrics](#metrics)
    -   [readme](#readme)
    -   [restart](#restart)
-   [DNV?!](#dnv)
-   [Running DNV on Windows with WSL](#running-dnv-on-windows-with-wsl)
    -   [Step 1 - Running WSL as Admin](#step-1---running-wsl-as-admin)
    -   [Step 2 - Install gsudo](#step-2---install-gsudo)
    -   [Step 3 - Install Windows Terminal Preview and create a profile to run the WSL as Admin](#step-3---install-windows-terminal-preview-and-create-a-profile-to-run-the-wsl-as-admin)
    -   [Step 4 (optional) - Modify .bashrc to navigate to Linux home directory on startup](#step-4-optional---modify-bashrc-to-navigate-to-linux-home-directory-on-startup)

<!-- End Document Outline -->

## Install

```console
$ npm install -g dnv
```

## Description

DNV works behind the scenes to keep dependencies in your Docker container in-sync with your your local project.

It also comes with a custom made, featureful ncurses-like UI designed
for use when developing apps using Docker Compose.

![terminal](https://user-images.githubusercontent.com/13556/126150865-196c4a88-ba0e-46d5-a7aa-cf73d5fbb625.png)

## Basic Usage

While in a project directory (has a package.json file, at a minimum):

### Initialize DNV Project

```console
$ dnv init
```

### Run DNV UI

```console
$ dnv ui
```

## DNV CLI commands

```console
    Usage
        $ dnv <command>

    Commands
        clear -- Remove containers, volumes, images and clear configuration for DNV projects
        config -- Modify project / default configuration
        info -- Display project configuration
        init -- Initialize project in current directory
        ui -- Start project using DNVs Multiplexing UI
        up -- Start project using 'docker-compose up'
        stop -- Run docker-compose stop for DNV projects

    Example
        $ dnv init (initialize DNV project in current directory)
        $ dnv config (edit configuration of project in current directory)
        $ dnv up -h (show help for 'up' command)
        $ dnv ui (Run DNV UI for project in current directory)
```

### Clear

```console
    Usage: dnv clear [options]

    Remove containers, volumes and config for DNV projects

    Options:
    -p --project      Remove Docker objects and configuration for current directory project
    -s --select       Remove Docker objects and configuration for selected projects
    -d --docker       Remove containers, volumes and images created by DNV for selected projects
    -r --reset        Remove all DNV created Docker elements and clear configuration
    -f --force        bypass prompts
    --dependencies    Delete npm / yarn / yarn v2 lock files and dependency folders in the current directory.
```

### Config

```console
    Usage: dnv config [options]

    Set project configuration

    Opens project associated with current directory when no options passed

    Options:
      -s --select   Open configuration for selected project
      -d --default  Open Default configuration
```

### Info

```console
    Usage: dnv info [options]

    Output project configuration

    Displays project configuration associated with current directory when no options passed

    Options:
      -a --all      Output entire project config object, including internally used values
      -d --default  Output default configuration
      -p --path     Output config file path
```

### Init

```console
    Usage: dnv init [options]

    Initialize project

    Options:
      -h, --help  display help for command
```

### UI

```console
    Usage: dnv ui [options]

    Run project with DNVs Multiplexing UI

    Options:
      --since <since>            Load container logs from this time forward. Can be a duration string (i.e. 1h30m)
      --scrollback <scrollback>  The amount of scrollback for logs in DNV UI
      --service <service...>     Specify services to display in DNV UI
      --nosync                   Do not synchronize docker-compose.yml and project configuration and do not re-generate docker-compose-dnv.gen.yml
      -i --install               re-generate docker-compose-dnv-gen.yml (if needed) and force run npm/yarn install in container
      -f --file <filename...>    Specify additional .yml files to be merged with generated DNV file
      -q --quit                  Go through the startup process, but quit before running docker-compose up (or attaching to running containers).
                                 This will update project configuration based on changes to Docker files, as well as re-generate docker-compose-dnv-gen.yml
```

### Up

```console
    Usage: dnv up [options]

    Run docker-compose up

    Options:
      --since <since>            Load container logs from this time forward. Can be a duration string (i.e. 1h30m)
      --scrollback <scrollback>  The amount of scrollback for logs in DNV UI
      --service <service...>     Specify services to display in DNV UI
      --nosync                   Do not synchronize docker-compose.yml and project configuration and do not re-generate docker-compose-dnv.gen.yml
      -i --install               Force run install in container
      -f --file <filename...>    Specify additional .yml files to be merged with generated DNV file
      -d --detach                Detached mode: Run containers in the background
      -q --quit                  Go through the startup process, but quit before running docker-compose up (or attaching to running containers).
                                 This will update project configuration based on changes to Docker files, as well as re-generate docker-compose-dnv-gen.yml
```

### Stop

```console
Usage: dnv stop [options]

Run docker-compose stop for current directory project
```

(Useful when the 'External Volume' option is set during project initialization)

## DNV Init Notes

### Behavior with existing Dockerfile / docker-compose.yml files

-   If \***\*both\*\*** a Dockerfile and docker-compose.yml are present, DNV will refer to those files when initializing the project.
-   If \***\*neither\*\*** file is present, DNV will generate a basic Dockerfile and docker-compose.yml
-   If \***\*only one\*\*** of either Dockerfile or docker-compose.yml is present, initialization will error out

### Initialization options / prompts

#### Package Manager

```console
? Package Manager (Use arrow keys)
❯ npm (default)
  yarn
  yarn 2
```

#### External Volume

```console
? Do you want DNV to manage project dependencies in an external volume? (Y/n)
```

(See: [External Volume option](#external-volume))

#### Working Directory

```console
? Working directory (WORKDIR) (/usr/src/app)
```

#### Dockerfile Node Image

```console
? Dockerfile Node Image (Use arrow keys)
❯ node:16.5 (default)
  ──────────────
  node:16.5 (default)
  node:15.5
```

#### Use Node User

```console
? Use Node User (instead of root)? (y/N)
```

#### Restart containers option

```console
? Restart containers when source files change? Select services:
❯◯ service1
```

(See: [Restarting containers option](#restarting-containers-option))

#### Metrics display option (w/ External Volume option)

```console
? Enable metrics display for Node services in DNV UI. Select services:
❯◯ service1
```

#### Use alternate node image when DNV starts service (w/ External Volume option)

```console
? Use alternate image for DNV-started Node Services? (y/N)
```

### External Volume option

If you choose 'yes' for the `External Volume` option during project initialization, DNV will do the following:

-   Creates and manages an external volume containing the contents of `node_modules` / `.yarn`
-   Monitors your project's lock files for changes and re-runs npm/yarn install in Docker containers when necessary
-   Mounts your local dependency cache directory (yarn or NPM) during installation, for quick install of dependencies in Containers.
-   Force installs dependencies that require `node-gyp`, if necessary (additional dependencies can be added in the project config)
-   Generates a separate .yml file which is used when running `dnv ui` or `dnv up` (docker-compose-dnv-gen.yml)

#### What does this mean?

Well, `docker-compose up` won't build images for your Node containers from the Dockerfile(s), since the container file system is just the contents of your project directory plus the dependency directory (node_modules or .yarn), and DNV manages that. Consequently, changing dependencies for your project doesn't require rebuilding an image, so that's quick and painless.

#### Should I use this?

If you're just starting development and don't have your Node dependencies nailed down yet, absolutely. It will make developing with Docker Compose much more pleasant. Otherwise, you probably won't get much benefit from it.

Note that the 'Metrics display' option is only available with the External Volume option enabled.

### Restarting containers option

If you choose 'yes' for `Restart containers when source files change?`, then DNV will...do exactly that: Restart containers when your project's source files change. If you're already using something like `nodemon` for your project then you should \***\*not\*\*** use this feature.

## DNV UI commands

(press `F9` in the UI to see command list)

```console
 General UI                                                                Filtering                                                  │
│  Exit UI                                      Ctrl + q                    Submit / Cancel            Enter / Escape                 │
│  Select Service Panel                         Ctrl + Direction            Clear prompt               Ctrl + x                       │
│  Select Service Sub-Panel                     Alt + Direction             Cycle prior filters        Ctrl + Up / Down               │
│  Close/Exit Sub-Panel                         Ctrl + z                    Clear filter               Ctrl + g                       │
│  Maximize Panel                               Alt + x                                                                               │
│  Display Log and Sub-Panels in a Grid         Alt + Shift + x             Exec / Scripts                                            │
│  Minimize Panel / Close Sub-Panel Grid        Alt + x                     Run selection              Enter                          │
│  Next Services Page                           Ctrl + Shift + Right        Show arguments input       Space                          │
│  Prev Services Page                           Ctrl + Shift + Left                                                                   │
│  Select Services Page                         F1 -> F8                    Panel Actions (like Action, Search, Filter etc)           │
│  Scroll Up Log                                Up, Shift-Up, Page-Up       Run Action                 Ctrl + indicated letter        │
│  Scroll Down Log                              Down, Shift-Down, Page-Down                                                           │
│  Scroll to Start of Log                       Home                        REPL / Shell Scrolling                                    │
│  Scroll to End of Log                         End                         Scroll                     Page-Up, Page-Down             │
│                                                                           Faster Scroll              PgUp/PgDwn + Shift/Ctrl/Alt    │
│  Searching                                                                                                                          │
│  Submit / Cancel                              Enter / Escape              Mouse (on Linux)                                          │
│  Clear prompt                                 Ctrl + x                    Scroll with mousewheel                                    │
│  Cycle prior searches                         Ctrl + Up / Down            Drag-select text, copy to clipboard with Ctrl+C           │
│  Find next match                              Down                        Dbl Click                  Select Word                    │
│  Find previous match                          Up                          Triple Click               Select Line                    │
│  Find first match                             Ctrl + Home                 Incremental Select         Ctrl + Left Button             │
│  Find last match                              Ctrl + End                  Move Cursor (if visible)   Alt + Left Button	          |
```

### Action menu (`Ctrl + a`)

#### bash / sh

Opens a bash / sh shell in the container

#### exec

Shows a list of installed programs (installed via apt/apk as well as npm globally installed packages). If you run, for example, `apt update` and then `apt install htop` in a bash/sh shell, then `htop` will appear in the exec menu.

#### repl

Opens a repl session in your project directory

#### scripts

Shows a list of options comprising

-   Scripts defined in your project's package.json
-   Any .sh files found in your project directory

Pressing `space` (as opposed to enter) shows a prompt to enter arguments (in the case of .sh scripts) or modify the executed command (for package.json script entries)

#### metrics

Shows a 'metrics' display for the node process. Shows graphs for

-   CPU usage
-   Memory usage
-   Event loop time
-   Active handles

#### readme

Lets you open the README.md for your project's dependencies.

Pressing `Ctrl + e` opens a sections menu for quick navigation.

#### restart

Restarts the container

## DNV?!

DNV stands for `Docker Node Volume`. Originally, the CLI program just created the external volume containing node_modules and ran `docker-compose up`. It does way more now, but I stuck with the original name.

## Running DNV on Windows with WSL

The ideal setup to run DNV on Windows employs the following:

-   [Docker Desktop](https://hub.docker.com/editions/community/docker-ce-desktop-windows) (required, obviously)
-   [Windows Terminal Preview](https://www.microsoft.com/en-us/p/windows-terminal-preview/9n8g5rfz9xk3#activetab=pivot:overviewtab)
-   [Windows Subsystem for Linux v2](https://docs.microsoft.com/en-us/windows/wsl/install-win10)
-   Working in the Linux directory-space, not the mounted Windows directory

Regarding the last point, Yarn/NPM/Node are EXTREMELY SLOW if your project is in the mounted Windows directory (/mnt/c/...).

The sticking point in this setup is that if Docker Desktop is running in Administrator mode, it means the WSL2 distribution you're using must also be running in Admin to see docker, which in turn means Windows Terminal Preview must be in Admin mode to run the WSL2 distribution.

> **(Note that all this headache can be avoided by adding your User Account to the docker-users group. See item #5** [here](https://docs.docker.com/docker-for-windows/install/#wsl-2-backend))

### Step 1 - Running WSL as Admin

-   Open PowerShell
-   Navigate to the directory where you want to download the distro installation (.appx) file, and run the following command

```console
Invoke-WebRequest -Uri https://aka.ms/wsl-debian-gnulinux -OutFile Debian.appx -UseBasicParsing
```

-   If you get an error, try renewing DNS by running the following commands in order
    -   ipconfig /release
    -   ipconfig /flushdns
    -   ipconfig /renew
-   In the download directory, change `Debian.appx` to `Debian.zip`, and extract the archive to a folder.
-   In the folder with the extracted archive contents, change `DistroLauncher-Appx_1.3.0.0_x64.appx` to `DistroLauncher-Appx_1.3.0.0_x64.zip`, and extract the archive.
-   Copy the contents of the newly-created folder to C:\debian (or wherever you want the distro executable to reside)
-   Open C:\debian, right-click on debian.exe, choose 'Run as administrator' and follow the installation prompts.

### Step 2 - Install [gsudo](https://github.com/gerardog/gsudo)

-   Open PowerShell
-   Run the following command

```console
PowerShell -Command "Set-ExecutionPolicy RemoteSigned -scope Process; iwr -useb https://raw.githubusercontent.com/gerardog/gsudo/master/installgsudo.ps1 | iex"
```

### Step 3 - Install Windows Terminal Preview and create a profile to run the WSL as Admin

-   Install Windows Terminal Preview [from the Microsoft Store](https://www.microsoft.com/en-us/p/windows-terminal-preview/9n8g5rfz9xk3#activetab=pivot:overviewtab)
-   Open Windows Terminal Preview, then open Settings
-   In the left side-bar menu, scroll down and click `Add a new profile`
-   Name this profile whatever you like ("Debian Admin" or some-such). In the Command line text area, paste the following

```console
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe gsudo wsl -d Debian
```

### Step 4 (optional) - Modify .bashrc to navigate to Linux home directory on startup

By default, WSL will open to a directory like `/mnt/c/WINDOWS/system32`, which is inconvenient. The following steps will alter .bashrc so your HOME directory is opened on startup, instead.

-   In Windows Terminal Preview, start a command line using the profile you just created and do the following commands:
    -   `sudo apt update`
    -   `sudo apt install nano`
    -   `cd ~`
    -   `nano .bashrc`
-   In the nano editor, scroll to the very bottom of the .bashrc file and add the following line:
    -   `cd ~`
-   Press `Ctrl + O` and then `Enter` to save, and then `Ctrl + X` to quit.
