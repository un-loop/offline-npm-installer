#!/usr/bin/env node

import * as program from "commander";
import { installCache, IScriptMessage, ScriptMessageType } from "./installer";

// Prints output to stdout
const print = (data: IScriptMessage) => {
  if (data.type !== ScriptMessageType.INFO_MINOR) {
    console.log(`** [${data.source}] ${data.message}\n`);
  } else {
    console.log(`[${data.source}] ${data.message}`);
  }
};

/* tslint:disable no-unsafe-any (tslint complains about commander) */
program
  .version("v1.0.0")
  .command("install <pkg> [otherPkgs...]")
  .action((pkg: string, otherPkgs: string[]) => {
    let packages = [pkg];
    if (otherPkgs.length > 0) {
      packages = packages.concat(otherPkgs);
    }

    installCache({
      onInfo: print,
      packages
    });
  });

program.parse(process.argv);
