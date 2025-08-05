import * as vscode from "vscode";
import { EXTENSION_NAME } from "./constants";
import { getGitApi, GitAPI, Repository } from "./git";
import { updateContext } from "./utils";
import { commit } from "./watcher";

interface GitTimelineItem {
  message: string;
  ref: string;
  previousRef: string;
}

export function registerCommands(context: vscode.ExtensionContext) {
  function getRepo(git: GitAPI): Repository | null {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri) return git.getRepository(uri);
    return git.repositories[0] ?? null;
  }
  function registerCommand(name: string, callback: (...args: any[]) => any) {
    context.subscriptions.push(vscode.commands.registerCommand(`${EXTENSION_NAME}.${name}`, callback));
  }

  registerCommand("enable", updateContext.bind(null, true));
  registerCommand("disable", updateContext.bind(null, false));

  registerCommand("restoreVersion", async (item: GitTimelineItem) => {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    const path = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri.path);

    const git = await getGitApi();
    if (!git) return;
    const repo = git.getRepository(vscode.window.activeTextEditor.document.uri);
    if (!repo) return;

    // @ts-ignore
    await repo.repository.repository.checkout(item.ref, [path]);

    // TODO: Look into why the checkout
    // doesn't trigger the watcher.
    commit(repo);
  });

  registerCommand("squashVersions", async (item: GitTimelineItem) => {
    const message = await vscode.window.showInputBox({
      prompt: "Enter the name to give to the new squashed version",
      value: item.message,
    });

    if (!message) return;
    const git = await getGitApi();
    if (!git) return;
    const repo = getRepo(git);
    if (!repo) return;
    // @ts-ignore
    await repo.repository.reset(`${item.ref}~1`);
    await commit(repo, message);
  });

  registerCommand("undoVersion", async (item: GitTimelineItem) => {
    const git = await getGitApi();
    if (!git) return;
    const repo = getRepo(git);
    if (!repo) return;
    // @ts-ignore
    await repo.repository.repository.run([
      "revert",
      "-n", // Tell Git not to create a commit, so that we can make one with the right message format
      item.ref,
    ]);

    await commit(repo);
  });

  registerCommand("commit", async () => {
    const git = await getGitApi();
    if (!git) return;
    const repo = getRepo(git);
    if (repo) await commit(repo);
  });
}
