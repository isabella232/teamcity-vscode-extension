"use strict";

import {
    Disposable,
    extensions,
    MessageItem,
    OutputChannel,
    QuickDiffProvider,
    scm,
    SourceControlInputBox,
    SourceControlResourceState,
    window,
    workspace,
    WorkspaceEdit
} from "vscode";
import {Logger} from "./utils/logger";
import {XmlParser} from "./bll/xmlparser";
import {VsCodeUtils} from "./utils/vscodeutils";
import {RemoteLogin} from "./dal/remotelogin";
import {ProjectItem} from "./entities/projectitem";
import {CheckInInfo} from "./interfaces/checkininfo";
import {PatchSender} from "./interfaces/PatchSender";
import {MessageConstants} from "./utils/MessageConstants";
import {CredentialsStore} from "./credentialsstore/credentialsstore";
import {Credentials} from "./credentialsstore/credentials";
import {BuildConfigItem} from "./entities/buildconfigitem";
import {RemoteBuildServer} from "./dal/remotebuildserver";
import {CvsSupportProvider} from "./interfaces/cvsprovider";
import {CvsLocalResource} from "./entities/cvslocalresource";
import {MessageManager} from "./view/messagemanager";
import {CustomPatchSender} from "./remoterun/custompatchsender";
import {CvsSupportProviderFactory} from "./remoterun/cvsproviderfactory";
import {DataProviderManager} from "./view/dataprovidermanager";
import {CommandHolder} from "./commandholder";
import {Settings} from "./interfaces/settings";
import {injectable, inject} from "inversify";
import {TYPES} from "./utils/constants";

@injectable()
export class CommandHolderImpl implements CommandHolder {
    private _cvsProvider: CvsSupportProvider;
    private _remoteLogin: RemoteLogin;
    private _remoteBuildServer: RemoteBuildServer;
    private _credentialsStore: CredentialsStore;
    private _settings: Settings;

    constructor(@inject(TYPES.RemoteLogin) remoteLogin: RemoteLogin,
                @inject(TYPES.RemoteBuildServer) remoteBuildServer: RemoteBuildServer) {
        this._remoteLogin = remoteLogin;
        this._remoteBuildServer = remoteBuildServer;
    }

    public init(settings: Settings, credentialsStore: CredentialsStore): void {
        this._settings = settings;
        this._credentialsStore = credentialsStore;
    }

    public async signIn(): Promise<boolean> {
        Logger.logInfo("CommandHolderImpl#signIn: starts");
        let signedIn: boolean = false;
        let credentials: Credentials;
        //try getting credentials from keytar
        try {
            const keytar = require("keytar");
            Logger.logDebug(`CommandHolder#signIn: keytar is supported. Good job user.`);
            const serverUrl = await keytar.getPassword("teamcity", "serverurl");
            const user = await keytar.getPassword("teamcity", "username");
            const password = await keytar.getPassword("teamcity", "password");
            if (serverUrl && user && password) {
                this._remoteLogin.init(serverUrl);
                const loginInfo: string[] = VsCodeUtils.parseValueColonValue(await this._remoteLogin.authenticate(user, password));
                const sessionId = loginInfo[0];
                const userId = loginInfo[1];
                credentials = new Credentials(serverUrl, user, password, userId, sessionId);
                signedIn = !!loginInfo;
            }
            Logger.logDebug(`CommandHolder#signIn: password was${signedIn ? "" : " not"} found at keytar.`);
        } catch (err) {
            Logger.logError(`CommandHolder#signIn: Unfortunately storing a password is not supported. The reason: ${VsCodeUtils.formatErrorMessage(err)}`);
        }

        if (!signedIn) {
            credentials = await this.requestTypingCredentials();
            signedIn = !!credentials;
        }

        if (signedIn) {
            this._credentialsStore.setCredential(credentials);
            Logger.logInfo("CommandHolderImpl#signIn: success");
            if (this._settings.showSignInWelcome) {
                this.showWelcomeMessage();
            }
            this.storeLastUserCredentials(credentials);
        } else {
            Logger.logWarning("CommandHolderImpl#signIn: failed");
        }
        return signedIn;
    }

    public async selectFilesForRemoteRun() {
        Logger.logInfo("CommandHolderImpl#selectFilesForRemoteRun: starts");
        this._cvsProvider = await CvsSupportProviderFactory.getCvsSupportProvider();
        if (this._cvsProvider === undefined) {
            //If there is no provider, log already contains message about the problem
            return;
        }
        const checkInInfo: CheckInInfo = await this._cvsProvider.getRequiredCheckInInfo();
        DataProviderManager.setExplorerContent(checkInInfo.cvsLocalResources);
        DataProviderManager.refresh();
    }

    public async getSuitableConfigs() {
        Logger.logInfo("CommandHolderImpl#getSuitableConfigs: starts");
        const credentials: Credentials = await this.tryGetCredentials();
        if (credentials === undefined) {
            //If there are no credentials, log already contains message about the problem
            return;
        }
        // const apiProvider: TCApiProvider = new TCXmlRpcApiProvider();
        const selectedResources: CvsLocalResource[] = DataProviderManager.getInclResources();
        if (selectedResources && selectedResources.length > 0) {
            this._cvsProvider.setFilesForRemoteRun(selectedResources);
        } else {
            this._cvsProvider = await CvsSupportProviderFactory.getCvsSupportProvider();
        }

        if (this._cvsProvider === undefined) {
            //If there is no provider, log already contains message about the problem
            return;
        }
        const tcFormattedFilePaths: string[] = await this._cvsProvider.getFormattedFileNames();

        /* get suitable build configs hierarchically */
        this._remoteBuildServer.init(this._credentialsStore);
        const shortBuildConfigNames: string[] = await this._remoteBuildServer.getSuitableConfigurations(tcFormattedFilePaths);
        const buildXmlArray: string[] = await this._remoteBuildServer.getRelatedBuilds(shortBuildConfigNames);
        const projects: ProjectItem[] = await XmlParser.parseBuilds(buildXmlArray);
        VsCodeUtils.filterConfigs(projects, shortBuildConfigNames);

        if (projects && projects.length > 0) {
            await this._settings.setEnableRemoteRun(true);
        }
        DataProviderManager.setExplorerContent(projects);
        DataProviderManager.refresh();
        MessageManager.showInfoMessage(MessageConstants.PLEASE_SPECIFY_BUILDS);
        Logger.logInfo("CommandHolderImpl#getSuitableConfigs: finished");
    }

    public async remoteRunWithChosenConfigs() {
        Logger.logInfo("CommandHolderImpl#remoteRunWithChosenConfigs: starts");
        const credentials: Credentials = await this.tryGetCredentials();
        if (!credentials || !this._cvsProvider) {
            Logger.logWarning("CommandHolderImpl#remoteRunWithChosenConfigs: credentials or cvsProvider absents. Try to sign in again");
            return;
        }
        const includedBuildConfigs: BuildConfigItem[] = DataProviderManager.getIncludedBuildConfigs();
        if (includedBuildConfigs === undefined || includedBuildConfigs.length === 0) {
            MessageManager.showErrorMessage(MessageConstants.NO_CONFIGS_RUN_REMOTERUN);
            Logger.logWarning("CommandHolderImpl#remoteRunWithChosenConfigs: no selected build configs. Try to execute the 'GitRemote run' command");
            return;
        }

        await this._settings.setEnableRemoteRun(false);
        DataProviderManager.setExplorerContent([]);
        DataProviderManager.refresh();
        const patchSender: PatchSender = new CustomPatchSender(credentials);
        const remoteRunResult: boolean = await patchSender.remoteRun(includedBuildConfigs, this._cvsProvider);
        if (remoteRunResult) {
            Logger.logInfo("CommandHolderImpl#remoteRunWithChosenConfigs: remote run is ok");
            this._cvsProvider.requestForPostCommit();
        } else {
            Logger.logWarning("CommandHolderImpl#remoteRunWithChosenConfigs: something went wrong during remote run");
        }
        Logger.logInfo("CommandHolderImpl#remoteRunWithChosenConfigs: finishes");
    }

    private getDefaultURL(): string {
        return this._settings.getLastUrl();
    }

    private getDefaultUsername(): string {
        return this._settings.getLastUsername();
    }

    private async tryGetCredentials(): Promise<Credentials> {
        let credentials: Credentials = this._credentialsStore.getCredential();
        if (!credentials) {
            Logger.logInfo("CommandHolderImpl#tryGetCredentials: credentials is undefined. An attempt to get them");
            await this.signIn();
            credentials = this._credentialsStore.getCredential();
            if (!credentials) {
                MessageManager.showErrorMessage(MessageConstants.NO_CREDENTIALS_RUN_SIGNIN);
                Logger.logWarning("CommandHolderImpl#tryGetCredentials: An attempt to get credentials failed");
                return undefined;
            }
        }
        Logger.logInfo("CommandHolderImpl#tryGetCredentials: success");
        return credentials;
    }

    private async showWelcomeMessage() {

        const dontShowAgainItem: MessageItem = {title: MessageConstants.DO_NOT_SHOW_AGAIN};
        const chosenItem: MessageItem = await MessageManager.showInfoMessage(MessageConstants.WELCOME_MESSAGE, dontShowAgainItem);
        if (chosenItem && chosenItem.title === dontShowAgainItem.title) {
            this._settings.setShowSignInWelcome(false);
        }
    }

    private async requestTypingCredentials(): Promise<Credentials> {
        const defaultURL: string = this.getDefaultURL();
        const defaultUsername: string = this.getDefaultUsername();

        let serverUrl: string = await window.showInputBox({
            value: defaultURL || "",
            prompt: MessageConstants.PROVIDE_URL,
            placeHolder: "",
            password: false
        });
        if (!serverUrl) {
            //It means that user clicked "Esc": abort the operation
            Logger.logDebug("CommandHolderImpl#signIn: abort after serverUrl inputBox");
            return;
        } else {
            //to prevent exception in case of slash in the end ("localhost:80/). serverUrl should be contained without it"
            serverUrl = serverUrl.replace(/\/$/, "");
        }

        const user: string = await window.showInputBox({
            value: defaultUsername || "",
            prompt: MessageConstants.PROVIDE_USERNAME + " ( URL: " + serverUrl + " )",
            placeHolder: "",
            password: false
        });
        if (!user) {
            Logger.logDebug("CommandHolderImpl#signIn: abort after username inputBox");
            //It means that user clicked "Esc": abort the operation
            return;
        }

        const password = await window.showInputBox({
            prompt: MessageConstants.PROVIDE_PASSWORD + " ( username: " + user + " )",
            placeHolder: "",
            password: true
        });
        if (!password) {
            //It means that user clicked "Esc": abort the operation
            Logger.logDebug("CommandHolderImpl#signIn: abort after password inputBox");
            return;
        }
        this._remoteLogin.init(serverUrl);
        const loginInfo: string[] = VsCodeUtils.parseValueColonValue(await this._remoteLogin.authenticate(user, password));
        const sessionId = loginInfo[0];
        const userId = loginInfo[1];
        return new Credentials(serverUrl, user, password, userId, sessionId);
    }

    private async storeLastUserCredentials(credentials: Credentials): Promise<void> {
        if (!credentials) {
            return;
        }
        await this._settings.setLastUrl(credentials.serverURL);
        await this._settings.setLastUsername(credentials.user);
        try {
            const keytar = require("keytar");
            Logger.logDebug(`CommandHolder#storeLastUserCredentials: keytar is supported. Good job user.`);
            keytar.setPassword("teamcity", "serverurl", credentials.serverURL);
            keytar.setPassword("teamcity", "username", credentials.user);
            keytar.setPassword("teamcity", "password", credentials.password);
        } catch (err) {
            Logger.logError(`CommandHolder#storeLastUserCredentials: Unfortunately storing a password is not supported. The reason: ${VsCodeUtils.formatErrorMessage(err)}`);
        }
    }
}
