import * as archiver from "archiver";
import { ChildProcess, exec, spawn } from "child_process";
import { createWriteStream, remove } from "fs-extra";

export enum ScriptMessageType {
  MINOR,
  MAJOR,
  ERROR,
  COMPLETE
}

export enum InfoSource {
  NPM = "npm",
  VERDACCIO = "verdaccio",
  OFFLINE_NPM = "offline-npm",
  ARCHIVER = "archiver"
}

export interface IScriptMessage {
  type: ScriptMessageType;
  message: string;
  source: InfoSource;
}

// Utility to make using callbacks with IScriptMessages easier
const makeOutputter = (
  callback: (data: IScriptMessage) => void,
  type: ScriptMessageType
) => (message: string, source: InfoSource = InfoSource.OFFLINE_NPM) =>
  callback({
    message,
    source,
    type
  });

/**
 * Installs an npm cache through Verdaccio and bundles the results in a zip file.
 * @param packages the list of package names to install
 * @param outputPath the directory in which storage.zip should be placed
 * @param onInfo callback function for info messages
 * @param onError callback function for error messages
 * @param onComplete callback function for when the installation is complete
 */
export const installCache = (
  packages: string[],
  outputPath: string,
  onInfo: (data: IScriptMessage) => void,
  onError: (data: IScriptMessage) => void,
  onComplete: (data: IScriptMessage) => void
): void => {
  const outMinor = makeOutputter(onInfo, ScriptMessageType.MINOR);
  const outMajor = makeOutputter(onInfo, ScriptMessageType.MAJOR);
  const outError = makeOutputter(onError, ScriptMessageType.ERROR);
  const outComplete = makeOutputter(onComplete, ScriptMessageType.COMPLETE);

  // Delete the storage directory and output the final results
  const endScript = () => {
    outMajor("Deleting temporary files.");

    remove("./storage", () => {
      outComplete(`\nCache created at ${outputPath}/storage.zip!`);
    });
  };

  // Package the cache into a .zip file
  const packageCache = () => {
    outMajor("Bundling the cache into a zip file.");

    const archive = archiver("zip");
    const zipOut = createWriteStream(`${outputPath}/storage.zip`);

    archive.on("end", endScript);
    archive.on("error", err => {
      outError(err.message, InfoSource.ARCHIVER);
    });

    archive.pipe(zipOut);
    archive.directory("storage/", false);
    archive.finalize();
  };

  // Stop Verdaccio
  const stopVerdaccio = (verdaccio: ChildProcess) => {
    outMajor("Stopping Verdaccio.");

    // See https://stackoverflow.com/questions/23706055
    spawn("taskkill", ["/pid", verdaccio.pid.toString(), "/f", "/t"]).on(
      "exit",
      packageCache
    );
  };

  // Install the packages
  const installPackages = (verdaccio: ChildProcess) => {
    outMajor("Starting package installs.");

    let packageNum = 0;

    const installPackage = () => {
      outMajor(
        `Installing '${packages[packageNum]} (${packageNum + 1}/${
          packages.length
        })`
      );

      const install = exec(
        `npm install ${
          packages[packageNum]
        } --registry http://localhost:4873/ --no-save`
      );

      install.stdout.on("data", (data: string) => {
        outMinor(data.trim(), InfoSource.NPM);
      });

      install.stderr.on("data", (data: string) => {
        outError(data.trim(), InfoSource.NPM);
      });

      install.on("exit", () => {
        if (++packageNum < packages.length) {
          installPackage();
        } else {
          outMajor(`Finished installing ${packages.length} packages.`);
          stopVerdaccio(verdaccio);
        }
      });
    };

    installPackage();
  };

  // Spin up Verdaccio
  const startVerdaccio = () => {
    outMajor("Booting Verdaccio instance.");

    const verdaccio = exec("node node_modules\\verdaccio\\build\\lib\\cli");

    verdaccio.stdout.on("data", (data: string) => {
      outMinor(data.trim(), InfoSource.VERDACCIO);

      // When Verdaccio emits a successful load message, start installing packages
      if (data.indexOf(`Plugin successfully loaded: audit`) !== -1) {
        installPackages(verdaccio);
      }
    });

    verdaccio.stderr.on("data", (data: string) => {
      outError(data.trim());
    });
  };

  // Delete local Verdaccio storage and/or storage.zip, if they exist
  const deleteOldFiles = () => {
    outMajor("Deleting old files.");

    remove("./storage", () => {
      remove(`${outputPath}/storage.zip`, startVerdaccio);
    });
  };

  // Clean npm cache (required for packages to get cached by Verdaccio)
  const cleanCache = () => {
    outMajor("Clearing NPM cache.");

    const cleanProcess = exec("npm cache clean --force");

    cleanProcess.stdout.on("data", (data: string) => {
      outMinor(data.trim(), InfoSource.NPM);
    });

    cleanProcess.on("exit", deleteOldFiles);
  };

  // Kick off process
  cleanCache();
};
