"use strict";

import * as path from "path";
import {Finder} from "./finder";
import {workspace} from "vscode";
import {Constants} from "../utils/constants";
import * as fs_async_module from "async-file";
import * as cp_module from "child-process-promise";
import {Process} from "../moduleinterfaces/process";
import {AsyncFs} from "../moduleinterfaces/asyncfs";
import {AsyncChildProcess} from "../moduleinterfaces/asyncchildprocess";
import {MessageConstants} from "../utils/messageconstants";

export class GitPathFinder implements Finder {
    private readonly _fs: AsyncFs;
    private readonly _process: Process;
    private readonly _childProcess: AsyncChildProcess;

    constructor(childProcessMock?: AsyncChildProcess, processMock?: Process, fsMock?: AsyncFs) {
        this._fs = fsMock || fs_async_module;
        this._process = processMock || process;
        this._childProcess = childProcessMock || cp_module;
    }

    public async find(): Promise<string> {
        const pathHint = this.getPathHind();
        try {
            return await this.findGitPath(pathHint);
        } catch (err) {
            throw new Error(MessageConstants.GIT_PATH_IS_NOT_FOUND);
        }
    }

    private getPathHind(): string {
        return workspace.getConfiguration().get<string>(Constants.GIT_PATH_SETTING_NAME);
    }

    private async findGitPath(hint: string | undefined): Promise<string> {
        const firstSearchPromise = hint ? this.checkPath(hint) : Promise.reject<string>(undefined);
        return firstSearchPromise.then(void 0, () => {
            switch (this._process.platform) {
                case "win32":
                    return this.findGitWin32();
                case "darwin":
                    return this.findGitDarwin();
                default:
                    return this.checkPath("git");
            }
        });
    }

    private async checkPath(path: string): Promise<string> {
        const getGitVersionCommand = `"${path}" --version`;
        const promiseResult = await this._childProcess.exec(getGitVersionCommand);
        const versionCommandResult: string = promiseResult.stdout.toString("utf8").trim();
        if (!versionCommandResult) {
            return Promise.reject<string>(undefined);
        }
        return path;
    }

    private async findGitWin32(): Promise<string> {
        return this.checkPath("git")
            .then(void 0, () => this.findSystemGitWin32(this._process.env["ProgramW6432"]))
            .then(void 0, () => this.findSystemGitWin32(this._process.env["ProgramFiles(x86)"]))
            .then(void 0, () => this.findSystemGitWin32(this._process.env["ProgramFiles"]))
            .then(void 0, () => this.findGitHubGitWin32());
    }

    private async findSystemGitWin32(base: string): Promise<string> {
        if (!base) {
            return Promise.reject<string>(undefined);
        }
        return this.checkPath(path.join(base, "Git", "cmd", "git.exe"));
    }

    private async findGitHubGitWin32(): Promise<string> {
        const gitHubDirectoryPath = path.join(this._process.env["LOCALAPPDATA"], "GitHub");
        const childObjects: string[] = await this.getChildObjects(gitHubDirectoryPath);
        const portableGitPath = await this.getFirstPortableGitObject(childObjects);
        return this.checkPath(path.join(gitHubDirectoryPath, portableGitPath, "cmd", "git.exe"));
    }

    private async getChildObjects(path: string): Promise<string[]> {
        return this._fs.readdir(path);
    }

    private async getFirstPortableGitObject(childObjects: string[]): Promise<string> {
        const portableGitPath = childObjects.filter((child) => /^PortableGit/.test(child))[0];
        if (!portableGitPath) {
            return Promise.reject<string>(undefined);
        }
        return portableGitPath;
    }

    private async findGitDarwin(): Promise<string> {
        try {
            const promiseResult = await this._childProcess.exec("which git");
            const whichCommandResult: string = promiseResult.stdout.toString("utf8").trim();
            const path = whichCommandResult.toString().replace(/^\s+|\s+$/g, "");
            if (path !== "/usr/bin/git") {
                return this.checkPath(path);
            }
            //TODO: check this case
            return this.checkPromptAbsence().then(() => this.checkPath(path));
        } catch (err) {
            return Promise.reject<string>(undefined);
        }
    }

    private async checkPromptAbsence() {
        const printDeveloperDirectoryPathCommand = "xcode-select -p";
        try {
            await this._childProcess.exec(printDeveloperDirectoryPathCommand);
        } catch (err) {
            if (this.isGitNotInstalled(err)) {
                // launching /usr/bin/git will prompt the user to install it
                return Promise.reject<string>(undefined);
            }
        }
    }

    private isGitNotInstalled(err: any) {
        const GIT_IS_NOT_INSTALLED_ERR_CODE = 2;
        /*According to Microsoft*/
        return err.code === GIT_IS_NOT_INSTALLED_ERR_CODE;
    }
}
