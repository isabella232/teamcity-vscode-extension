"use strict";

import {Logger} from "../utils/logger";
import {Credentials} from "../credentialsstore/credentials";
import {MessageConstants} from "../utils/messageconstants";
import {TeamCityStatusBarItem} from "../../view/teamcitystatusbaritem";
import {MessageItem, window} from "vscode";
import {MessageManager} from "../../view/messagemanager";
import {RemoteLogin} from "../../dal/remotelogin";
import {CredentialsStore} from "../credentialsstore/credentialsstore";
import {Settings} from "../entities/settings";
import {Output} from "../../view/output";
import {inject, injectable} from "inversify";
import {Constants, TYPES} from "../utils/constants";
import {PersistentStorageManager} from "../credentialsstore/persistentstoragemanager";
import {Utils} from "../utils/utils";

@injectable()
export class SignIn implements Command {

    private remoteLogin: RemoteLogin;
    private credentialsStore: CredentialsStore;
    private settings: Settings;
    private output: Output;
    private persistentStorageManager: PersistentStorageManager;

    public constructor(@inject(TYPES.RemoteLogin) remoteLogin: RemoteLogin,
                       @inject(TYPES.CredentialsStore) credentialsStore: CredentialsStore,
                       @inject(TYPES.Output) output: Output,
                       @inject(TYPES.Settings) settings: Settings,
                       @inject(TYPES.PersistentStorageManager) persistentStorageManager: PersistentStorageManager) {
        this.remoteLogin = remoteLogin;
        this.credentialsStore = credentialsStore;
        this.output = output;
        this.settings = settings;
        this.persistentStorageManager = persistentStorageManager;
    }

    public async exec(fromPersistentStore: boolean = false): Promise<void> {
        Logger.logInfo("SignIn#exec: starts.");
        let credentials: Credentials;
        if (!fromPersistentStore) {
            credentials = await this.requestTypingCredentials();
        } else {
            credentials = await this.tryGetCredentialsFromPersistence();
        }

        if (credentials) {
            this.credentialsStore.setCredentials(credentials);
            if (!fromPersistentStore) {
                this.storeLastUserCredentials(credentials).catch((err) => Logger.logError(err));
            }
            Logger.logInfo("SignIn#exec: success.");
            if (!fromPersistentStore) {
                await this.suggestToStoreCredentials(credentials);
            }
            this.greetUser(credentials);
        } else {
            Logger.logWarning("SignIn#exec: operation was aborted by user");
        }
    }

    private async tryGetCredentialsFromPersistence(): Promise<Credentials> {
        let credentials: Credentials;
        try {
            credentials = await this.getCredentialsFromPersistence();
        } catch (err) {
            Logger.logWarning(`[SignIn::tryGetCredentialsFromPersistence] failed to get credentials from persistence ` +
                `with error: ${Utils.formatErrorMessage(err)}`);
        }
        return credentials;
    }

    private async getCredentialsFromPersistence(): Promise<Credentials> {
        const creds: Credentials = await this.persistentStorageManager.getCredentials();
        return creds ? this.validateAndGenerateUserCredentials(creds.serverURL, creds.user, creds.password) : undefined;
    }

    private async validateAndGenerateUserCredentials(serverUrl: string, user: string, password: string): Promise<Credentials> {
        if (serverUrl && user && password) {
            Logger.logDebug(`SignIn#validateAndGenerateUserCredentials: credentials are not undefined and should be validated`);
            const unParsedColonValues: string = await this.remoteLogin.authenticate(serverUrl, user, password);
            const loginInfo: string[] = Utils.parseValueColonValue(unParsedColonValues);
            const authenticationSuccessful = !!loginInfo;
            if (authenticationSuccessful) {
                const sessionId = loginInfo[0];
                const userId = loginInfo[1];
                return Promise.resolve<Credentials>(new Credentials(serverUrl, user, password, userId, sessionId));
            }
            Logger.logDebug(`SignIn#validateAndGenerateUserCredentials: credentials were not passed an authentication check.`);
            return Promise.reject(MessageConstants.STATUS_CODE_401);
        }
        Logger.logDebug(`SignIn#validateAndGenerateUserCredentials: credentials are undefined.`);
        return Promise.reject("Credentials are undefined.");
    }

    private async requestTypingCredentials(): Promise<Credentials> {
        let serverUrl: string;
        let username: string;
        let password: string;
        const currentCredentials: Credentials = await this.tryGetCredentialsFromPersistence();
        const suggestedUrl = currentCredentials ? currentCredentials.serverURL : Constants.DEFAULT_URL;
        const suggestedUsername = currentCredentials ? currentCredentials.user : "";
        try {
            serverUrl = await SignIn.requestServerUrl(suggestedUrl);
            username = await SignIn.requestUsername(suggestedUsername, serverUrl);
            password = await SignIn.requestPassword(username);
        } catch (err) {
            return Promise.resolve(undefined);
        }
        return this.validateAndGenerateUserCredentials(serverUrl, username, password);
    }

    private static async requestServerUrl(defaultURL: string): Promise<string> {
        let serverUrl: string = await window.showInputBox({
            value: defaultURL || "",
            prompt: MessageConstants.PROVIDE_URL,
            placeHolder: "",
            password: false
        });
        const operationWasNotAborted: boolean = !!serverUrl;
        if (operationWasNotAborted) {
            serverUrl = this.removeSlashInTheEndIfExists(serverUrl);
            return Promise.resolve<string>(serverUrl);
        } else {
            return Promise.reject("Server URL was not specified.");
        }
    }

    private static removeSlashInTheEndIfExists(serverUrl: string): string {
        return serverUrl.replace(/\/$/, "");
    }

    private static async requestUsername(defaultUsername: string, serverUrl: string): Promise<string> {
        const userName: string = await window.showInputBox({
            value: defaultUsername || "",
            prompt: MessageConstants.PROVIDE_USERNAME + " ( URL: " + serverUrl + " )",
            placeHolder: "",
            password: false
        });
        const operationWasNotAborted: boolean = !!userName;
        if (operationWasNotAborted) {
            return Promise.resolve<string>(userName);
        } else {
            return Promise.reject("Username was not specified.");
        }
    }

    private static async requestPassword(username: string): Promise<string> {
        const password: string = await window.showInputBox({
            prompt: MessageConstants.PROVIDE_PASSWORD + " ( username: " + username + " )",
            placeHolder: "",
            password: true
        });
        const operationWasNotAborted: boolean = !!password;
        if (operationWasNotAborted) {
            return Promise.resolve<string>(password);
        } else {
            return Promise.reject("Password was not specified.");
        }
    }

    private async storeLastUserCredentials(credentials: Credentials): Promise<void> {
        if (!credentials) {
            return;
        }
        try {
            await this.persistentStorageManager.setCredentials(credentials);
        } catch (err) {
            Logger.logError(`SignIn#storeLastUserCredentials: Unfortunately storing a password is not supported. The reason: ${Utils.formatErrorMessage(err)}`);
        }
    }

    private async greetUser(credentials: Credentials): Promise<void> {
        this.output.appendLine(MessageConstants.WELCOME_MESSAGE);
        TeamCityStatusBarItem.setLoggedIn(credentials.serverURL, credentials.user);
        if (this.settings.showSignInWelcome) {
            await this.showWelcomeMessage();
        }
    }

    private async showWelcomeMessage(): Promise<void> {
        const doNotShowAgainItem: MessageItem = {title: MessageConstants.DO_NOT_SHOW_AGAIN};
        const chosenItem: MessageItem = await MessageManager.showInfoMessage(MessageConstants.WELCOME_MESSAGE, doNotShowAgainItem);
        if (chosenItem && chosenItem.title === doNotShowAgainItem.title) {
            await this.settings.setShowSignInWelcome(false);
        }
    }

    private async suggestToStoreCredentials(credentials: Credentials): Promise<void> {
        if (!this.settings.shouldAskStoreCredentials()) {
            return;
        }

        const storeCredentialsItem: MessageItem = {title: "Yes"};
        const notStoreCredentialsItem: MessageItem = {title: "No"};
        const doNotShowAgainItem: MessageItem = {title: MessageConstants.DO_NOT_ASK_AGAIN};
        const chosenItem: MessageItem = await MessageManager.showInfoMessage(
            MessageConstants.STORE_CREDENTIALS_SUGGESTION, storeCredentialsItem, notStoreCredentialsItem, doNotShowAgainItem);
        if (chosenItem && chosenItem.title === storeCredentialsItem.title) {
            await this.storeLastUserCredentials(credentials);
        } else if (chosenItem && chosenItem.title === doNotShowAgainItem.title) {
            await this.settings.setShowStoreCredentialsSuggestion(false);
            await this.persistentStorageManager.removeCredentials();
        } else {
            await this.persistentStorageManager.removeCredentials();
        }

    }

}
