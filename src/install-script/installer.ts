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
export const installCache = async (
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
): Promise<string> => {
  const outMinor = makeOutputter(onInfo, ScriptMessageType.MINOR);
  const outMajor = makeOutputter(onInfo, ScriptMessageType.MAJOR);
  const outError = makeOutputter(onError, ScriptMessageType.ERROR);
  const outComplete = makeOutputter(onComplete, ScriptMessageType.COMPLETE);

  const tempStoragePath = joinPath(__dirname, "storage");
  const outputZipPath = joinPath(outputPath, "storage.zip");

  outMajor("Starting cache install.");

  // Clean npm cache (required for packages to get cached by Verdaccio)
  await new Promise(resolve => {
    outMajor("Clearing NPM cache.");

    const cleanProcess = exec("npm cache clean --force");

    cleanProcess.stdout.on("data", (data: string) => {
      outMinor(data.trim(), InfoSource.NPM);
    });

    cleanProcess.on("exit", resolve);
  });

  // Delete local Verdaccio storage and/or storage.zip, if they exist
  await new Promise(resolve => {
    outMajor("Deleting old files.");

    remove(tempStoragePath, () => {
      remove(outputZipPath, resolve);
    });
  });

  // Spin up Verdaccio
  const verdaccio: ChildProcess = await new Promise<ChildProcess>(resolve => {
    outMajor("Booting Verdaccio instance.");

    const verdaccioProcess = exec(
      `node ${joinPath(
        verdaccioPath,
        "build",
        "lib",
        "cli"
      )} --config ${joinPath(__dirname, "config.yaml")}`
    );

    verdaccioProcess.stdout.on("data", (data: string) => {
      outMinor(data.trim(), InfoSource.VERDACCIO);

      // When Verdaccio emits a successful load message, start installing packages
      if (data.indexOf(`Plugin successfully loaded: audit`) !== -1) {
        resolve(verdaccioProcess);
      }
    });

    verdaccioProcess.stderr.on("data", (data: string) => {
      outError(data.trim());
    });
  });

  // Install the packages
  await new Promise(resolve => {
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
          resolve();
        }
      });
    };

    installPackage();
  });

  // Stop Verdaccio
  await new Promise(resolve => {
    outMajor("Stopping Verdaccio.");

    // See https://stackoverflow.com/questions/23706055
    spawn("taskkill", ["/pid", verdaccio.pid.toString(), "/f", "/t"]).on(
      "exit",
      resolve
    );
  });

  // Package the cache into a .zip file
  await new Promise(resolve => {
    outMajor("Bundling the cache into a zip file.");

    ensureDir(outputPath, () => {
      const archive = archiver("zip");
      const zipOut = createWriteStream(outputZipPath);

      archive.on("end", resolve);
      archive.on("error", err => {
        outError(err.message, InfoSource.ARCHIVER);
      });

      archive.pipe(zipOut);
      archive.directory(tempStoragePath, false);
      archive.finalize();
    });
  });

  // Delete the storage directory and output the final results
  await new Promise(resolve => {
    outMajor("Deleting temporary files.");

    remove(tempStoragePath, () => {
      outComplete(`Cache created at ${outputZipPath}!`);
      resolve();
    });
  });

  return Promise.resolve(outputZipPath);
};
