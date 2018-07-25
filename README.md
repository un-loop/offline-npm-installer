# Offline NPM Installer

[![Build Status](https://travis-ci.org/JoshuaKGoldberg/offline-npm-installer.svg?branch=master)](https://travis-ci.org/JoshuaKGoldberg/offline-npm-installer)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Scripts and GUI for creating a prepopulated [Verdaccio](https://github.com/verdaccio/verdaccio)-compatible npm cache.

## Why

Verdaccio is capable of acting as an npm server in offline environments (meaning absolutely no internet access).
However, you need to provide it with a cache of npm packages that it can serve.
This repository contains:

- Scripts for populating an npm cache and onloading the cache into a Verdaccio server
- Desktop programs to walk nontechnical users through that process

## Usage

> To be documented... soon!™

## Contributing

First, you'll need installed locally:

- [Git](https://github.com/JoshuaKGoldberg/offline-npm-installer/invitations)
- [Node](https://nodejs.org/en/download)
- [VS Code](https://code.visualstudio.com)

Then, [fork the project on GitHub](https://help.github.com/articles/fork-a-repo) and set it up locally:

```cmd
git clone https://github.com/<your-username-here>/offline-npm-installer
cd offline-npm-installer
npm i
```

### Development

Run the VS Code `tsc` [task](https://code.visualstudio.com/docs/editor/tasks) in the background to constantly recompile TypeScript files to JavaScript.

> Alternately, you can run `npm run watch` in your terminal.

To start the Electron app, run `npm run start` in your terminal.

### Tech Stack Buzzwords

- [Bootstrap](https://getbootstrap.com)
- [Electron](https://electronjs.org)
- [React](https://reactjs.org)
- [TypeScript](https://typescriptlang.org)
