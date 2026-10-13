'use strict';
// Workspace registry. Delta Capital is the first workspace; the core (store,
// vault, runs, router, connections) is workspace-agnostic.

const deltaCapital = require('./delta-capital');

const WORKSPACES = { [deltaCapital.id]: deltaCapital };
const DEFAULT_WORKSPACE = deltaCapital.id;

function getWorkspace(id = DEFAULT_WORKSPACE) {
  const ws = WORKSPACES[id];
  if (!ws) throw new Error(`Unknown workspace: ${id}`);
  return ws;
}

module.exports = { WORKSPACES, DEFAULT_WORKSPACE, getWorkspace };
