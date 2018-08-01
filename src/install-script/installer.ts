import * as archiver from "archiver";
import { ChildProcess, exec, spawn } from "child_process";
import { createWriteStream, ensureDir, remove } from "fs-extra";
import { join as joinPath } from "path";

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
) => (message: string, source: InfoSource = InfoSource.OFFLINE_NPM) => {
  callback({
    message,
    source,
    type
  });
};

/**
 * Installs an npm cache through Verdaccio and bundles the results in a zip file.
 * @param packages the list of package names to install
 * @param onInfo callback function for info messages
 * @param onError callback function for error messages
 * @param onComplete callback function for when the installation is complete
 * @param outputPath the directory in which storage.zip should be placed
 * @param verdaccioPath the directory in which the verdaccio source is located (usually node_modules)
 */
export const installCache = (
  packages: string[],
  onInfo: (data: IScriptMessage) => void,
  onError: (data: IScriptMessage) => void,
  onComplete: (data: IScriptMessage) => void,
  outputPath: string = joinPath(__dirname, "out"),
  verdaccioPath: string = joinPath(
    __dirname,
    "..",
    "..",
    "node_modules",
    "verdaccio"
  )
): void => {
  const outMinor = makeOutputter(onInfo, ScriptMessageType.MINOR);
  const outMajor = makeOutputter(onInfo, ScriptMessageType.MAJOR);
  const outError = makeOutputter(onError, ScriptMessageType.ERROR);
  const outComplete = makeOutputter(onComplete, ScriptMessageType.COMPLETE);

  const tempStoragePath = joinPath(__dirname, "storage");
  const outputZipPath = joinPath(outputPath, "storage.zip");

  // Delete the storage directory and output the final results
  const endScript = () => {
    outMajor("Deleting temporary files.");

    remove(tempStoragePath, () => {
      outComplete(`Cache created at ${outputZipPath}!`);
    });
  };

  // Package the cache into a .zip file
  const packageCache = () => {
    outMajor("Bundling the cache into a zip file.");

    ensureDir(outputPath, () => {
      const archive = archiver("zip");
      const zipOut = createWriteStream(outputZipPath);

      archive.on("end", endScript);
      archive.on("error", err => {
        outError(err.message, InfoSource.ARCHIVER);
      });

      archive.pipe(zipOut);
      archive.directory(tempStoragePath, false);
      archive.finalize();
    });
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
        `Installing '${packages[packageNum]}' (${packageNum + 1}/${
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

    const verdaccio = exec(
      `node ${joinPath(
        verdaccioPath,
        "build",
        "lib",
        "cli"
      )} --config ${joinPath(__dirname, "config.yaml")}`
    );

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

    remove(tempStoragePath, () => {
      remove(outputZipPath, startVerdaccio);
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
  outMajor("Starting cache install.");
  cleanCache();
};
