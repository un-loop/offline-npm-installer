#!/usr/bin/env node

import * as program from "commander";
import { installCache, IScriptMessage, ScriptMessageType } from "./installer";

// Prints output to stdout
const print = (data: IScriptMessage) => {
  if (data.type !== ScriptMessageType.MINOR) {
    console.log(`** [${data.source}] ${data.message}\n`);
  } else {
    console.log(`[${data.source}] ${data.message}`);
  }
};

program
  .version("v1.0.0")
  .command("install <pkg> [otherPkgs...]")
  .action((pkg: string, otherPkgs: string[]) => {
    let packages = [pkg];
    if (otherPkgs) {
      packages = packages.concat(otherPkgs);
    }

    installCache(packages, print, print, print);
  });

program.parse(process.argv);
