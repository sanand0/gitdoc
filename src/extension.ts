import { reaction } from "mobx";
import * as vscode from "vscode";
import { registerCommands } from "./commands";
import config from "./config";
import { getGitApi, GitAPI, RefType, Repository } from "./git";
import { store } from "./store";
import { commit, watchForChanges } from "./watcher";
import { updateContext } from "./utils";

export async function activate(context: vscode.ExtensionContext) {
  const git = await getGitApi();
  if (!git) {
    return;
  }

  // Initialize the store based on the
  // user/workspace configuration.
  store.enabled = config.enabled;

  registerCommands(context);

  // Enable/disable the auto-commit watcher as the user
  // opens/closes Git repos, modifies their settings
  // and/or manually enables it via the command palette.
  context.subscriptions.push(git.onDidOpenRepository(() => checkEnabled(git)));
  context.subscriptions.push(git.onDidCloseRepository(() => checkEnabled(git)));

  reaction(
    () => [store.enabled],
    () => checkEnabled(git),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("gitdoc.enabled") ||
        e.affectsConfiguration("gitdoc.excludeBranches") ||
        e.affectsConfiguration("gitdoc.autoCommitDelay") ||
        e.affectsConfiguration("gitdoc.filePattern")
      ) {
        checkEnabled(git);
      }
    }),
  );
}

let watcher: vscode.Disposable | null;
async function checkEnabled(git: GitAPI) {
  if (watcher) {
    watcher.dispose();
    watcher = null;
  }

  const repos: Repository[] = [];
  for (const repo of git.repositories) {
    let branch = repo.state.HEAD?.name;
    if (!branch) {
      const refs = await repo.getRefs();
      branch = refs.find((r) => r.type === RefType.Head)?.name;
    }
    if (branch && !config.excludeBranches.includes(branch)) repos.push(repo);
  }

  const enabled = repos.length > 0 && store.enabled;
  updateContext(enabled, false);

  if (enabled) watcher = watchForChanges(repos);
}

export async function deactivate() {
  if (!store.enabled || !config.commitOnClose) return;
  const git = await getGitApi();
  if (!git) return;
  for (const repo of git.repositories) await commit(repo);
}
