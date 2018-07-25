import * as archiver from "archiver";
import * as childProcess from "child_process";
import * as fse from "fs-extra";

console.log("Starting cache install script.");

// Load list of libraries to install from './packages', one per line
const libs: string[] = fse
  .readFileSync("packages")
  .toString()
  .split("\n")
  .map((item: string) => item.trim())
  .filter((item: string) => item.length > 0);
console.log("The following libraries will be installed:");
libs.forEach(lib => {
  console.log(`* ${lib}`);
});

// Clear NPM cache (required for packages to get cached by Verdaccio)
console.log("Clearing NPM cache.");
childProcess.exec(`npm cache clean --force`).on("exit", initialClean);

// Delete local Verdaccio storage and/or storage.zip, if they exist
function initialClean() {
  console.log("Cleaning old storage files.");
  fse.remove("./storage", () => {
    fse.remove("./storage.zip", startVerdaccio);
  });
}

// Spin up Verdaccio
function startVerdaccio() {
  console.log("Booting Verdaccio instance.");
  const verdaccio = childProcess.exec(
    "node node_modules\\verdaccio\\build\\lib\\cli"
  );

  verdaccio.stdout.on("data", (data: string) => {
    console.log(`[verdaccio]: ${data.trim()}`);

    // When Verdaccio emits a successful load message, start installing packages
    if (data.indexOf(`Plugin successfully loaded: audit`) !== -1) {
      installPackages(verdaccio);
    }
  });

  verdaccio.stderr.on("data", (data: string) => {
    console.error(`[verdaccio]: ${data.trim()}`);
  });
}

// Install the packages
function installPackages(verdaccio: childProcess.ChildProcess) {
  console.log("Starting package installs.");

  let packageNum = 0;

  function installPackage() {
    console.log(
      `Installing '${libs[packageNum]}' (${packageNum + 1}/${libs.length})`
    );

    const install = childProcess.exec(
      `npm install ${
        libs[packageNum]
      } --registry http://localhost:4873/ --no-save`
    );

    install.stdout.on("data", (data: string) => {
      console.log(`[npm stdout]: ${data.trim().replace("\n", " ")}`);
    });
    install.stderr.on("data", (data: string) => {
      console.error(`[npm stderr]: ${data.trim().replace("\n", " ")}`);
    });

    install.on("exit", () => {
      if (++packageNum < libs.length) {
        installPackage();
      } else {
        console.log(`Finished installing ${libs.length} packages.`);
        stopVerdaccio(verdaccio);
      }
    });
  }

  installPackage();
}

// Stop Verdaccio
function stopVerdaccio(verdaccio: childProcess.ChildProcess) {
  console.log(`Stopping verdaccio.`);

  // See https://stackoverflow.com/questions/23706055
  childProcess
    .spawn("taskkill", ["/pid", verdaccio.pid.toString(), "/f", "/t"])
    .on("exit", packageCache);
}

// Package the cache into a .zip file
function packageCache() {
  console.log("Bundling storage into zip file.");

  const archive = archiver("zip");
  const zipOut = fse.createWriteStream("storage.zip");

  archive.on("end", endScript);
  archive.on("error", err => {
    throw err;
  });

  archive.pipe(zipOut);
  archive.directory("storage/", false);
  archive.finalize();
}

// Delete the storage directory and output the final results
function endScript() {
  console.log("Deleting temporary directory.");
  fse.remove("./storage", () => {
    console.log("\nCache created at ./storage.zip!");
  });
}
