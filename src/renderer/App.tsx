import * as React from "react";

import { Launch } from "./launch";
import { Output } from "./output";
import { Packages } from "./packages";
import { Shell } from "./shell";

export const App = () => (
  <main role="main">
    <div className="container">
      <Packages />
      <Output />
      <Launch />
      <Shell />
    </div>
  </main>
);
