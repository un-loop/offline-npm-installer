import * as archiver from "archiver";
import { ChildProcess, exec, spawn } from "child_process";
import { createWriteStream, ensureDir, remove } from "fs-extra";
import { join as joinPath } from "path";

export enum ScriptMessageType {
  INFO_MINOR,
  INFO_MAJOR,
  WARNING
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

/**
 * Installs an npm cache through Verdaccio and bundles the results in a zip file.
 * @param packages the list of package names to install
 * @param onInfo callback function for info messages
 * @param outputPath the directory in which storage.zip should be placed
 * @param verdaccioPath the directory in which the verdaccio source is located (usually node_modules)
 */
export const installCache = async (
  packages: string[],
  onInfo: (data: IScriptMessage) => void,
  outputPath: string = joinPath(__dirname, "out"),
  verdaccioPath: string = joinPath(
    __dirname,
    "..",
    "..",
    "node_modules",
    "verdaccio"
  )
): Promise<string> => {
  const tempStoragePath = joinPath(__dirname, "storage");
  const outputZipPath = joinPath(outputPath, "storage.zip");

  onInfo({
    message: "Starting cache install.",
    source: InfoSource.OFFLINE_NPM,
    type: ScriptMessageType.INFO_MAJOR
  });

  try {
    // Clean npm cache (required for packages to get cached by Verdaccio)
    await new Promise(resolve => {
      onInfo({
        message: "Clearing NPM cache.",
        source: InfoSource.OFFLINE_NPM,
        type: ScriptMessageType.INFO_MAJOR
      });

      const cleanProcess = exec("npm cache clean --force");

      cleanProcess.stdout.on("data", (data: string) => {
        onInfo({
          message: data.trim(),
          source: InfoSource.NPM,
          type: ScriptMessageType.INFO_MINOR
        });
      });

      cleanProcess.on("exit", resolve);
    });

    // Delete local Verdaccio storage and/or storage.zip, if they exist
    await new Promise(resolve => {
      onInfo({
        message: "Deleting old files.",
        source: InfoSource.OFFLINE_NPM,
        type: ScriptMessageType.INFO_MAJOR
      });

      remove(tempStoragePath, () => {
        remove(outputZipPath, resolve);
      });
    });

    // Spin up Verdaccio
    const verdaccio: ChildProcess = await new Promise<ChildProcess>(resolve => {
      onInfo({
        message: "Booting Verdaccio instance.",
        source: InfoSource.OFFLINE_NPM,
        type: ScriptMessageType.INFO_MAJOR
      });

      const verdaccioProcess = exec(
        `node ${joinPath(
          verdaccioPath,
          "build",
          "lib",
          "cli"
        )} --config ${joinPath(__dirname, "config.yaml")}`
      );

      verdaccioProcess.stdout.on("data", (data: string) => {
        onInfo({
          message: data.trim(),
          source: InfoSource.VERDACCIO,
          type: ScriptMessageType.INFO_MINOR
        });

        // When Verdaccio emits a successful load message, start installing packages
        if (data.indexOf(`Plugin successfully loaded: audit`) !== -1) {
          resolve(verdaccioProcess);
        }
      });

      verdaccioProcess.stderr.on("data", (data: string) => {
        onInfo({
          message: data.trim(),
          source: InfoSource.VERDACCIO,
          type: ScriptMessageType.WARNING
        });
      });
    });

    // Install the packages
    await new Promise(resolve => {
      onInfo({
        message: "Starting package installs.",
        source: InfoSource.OFFLINE_NPM,
        type: ScriptMessageType.INFO_MAJOR
      });

      let packageNum = 0;

      const installPackage = () => {
        onInfo({
          message: `Installing '${packages[packageNum]}' (${packageNum + 1}/${
            packages.length
          })`,
          source: InfoSource.OFFLINE_NPM,
          type: ScriptMessageType.INFO_MAJOR
        });

        const install = exec(
          `npm install ${
            packages[packageNum]
          } --registry http://localhost:4873/ --no-save`
        );

        install.stdout.on("data", (data: string) => {
          onInfo({
            message: data.trim(),
            source: InfoSource.NPM,
            type: ScriptMessageType.INFO_MINOR
          });
        });

        install.stderr.on("data", (data: string) => {
          onInfo({
            message: data.trim(),
            source: InfoSource.NPM,
            type: ScriptMessageType.WARNING
          });
        });

        install.on("exit", () => {
          if (++packageNum < packages.length) {
            installPackage();
          } else {
            onInfo({
              message: `Finished installing ${packages.length} packages.`,
              source: InfoSource.OFFLINE_NPM,
              type: ScriptMessageType.INFO_MAJOR
            });
            resolve();
          }
        });
      };

      installPackage();
    });

    // Stop Verdaccio
    await new Promise(resolve => {
      onInfo({
        message: "Stopping Verdaccio.",
        source: InfoSource.OFFLINE_NPM,
        type: ScriptMessageType.INFO_MAJOR
      });

      // See https://stackoverflow.com/questions/23706055
      spawn("taskkill", ["/pid", verdaccio.pid.toString(), "/f", "/t"]).on(
        "exit",
        resolve
      );
    });

    // Package the cache into a .zip file
    await new Promise(resolve => {
      onInfo({
        message: "Bundling the cache into a zip file.",
        source: InfoSource.OFFLINE_NPM,
        type: ScriptMessageType.INFO_MAJOR
      });

      ensureDir(outputPath, () => {
        const archive = archiver("zip");
        const zipOut = createWriteStream(outputZipPath);

        archive.on("end", resolve);
        archive.on("error", err => {
          onInfo({
            message: err.message,
            source: InfoSource.NPM,
            type: ScriptMessageType.WARNING
          });
        });

        archive.pipe(zipOut);
        archive.directory(tempStoragePath, false);
        archive.finalize();
      });
    });

    // Delete the storage directory and output the final results
    await new Promise(resolve => {
      onInfo({
        message: "Deleting temporary files.",
        source: InfoSource.OFFLINE_NPM,
        type: ScriptMessageType.INFO_MAJOR
      });

      remove(tempStoragePath, () => {
        onInfo({
          message: `Cache created at ${outputZipPath}!`,
          source: InfoSource.OFFLINE_NPM,
          type: ScriptMessageType.INFO_MAJOR
        });
        resolve();
      });
    });

    return Promise.resolve(outputZipPath);
  } catch (err) {
    return Promise.reject(err);
  }
};
