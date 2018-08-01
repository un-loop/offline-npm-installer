#!/usr/bin/env node

import * as program from "commander";
import { installCache, IScriptMessage, ScriptMessageType } from "./installer";

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
    console.log("HEY");
    console.log(pkg);
    if (otherPkgs) {
      otherPkgs.forEach((oPkg: string) => {
        console.log(oPkg);
      });
    }
  });

program.parse(process.argv);

if (false) {
  installCache(["lodash", "react"], print, print, print);
}
