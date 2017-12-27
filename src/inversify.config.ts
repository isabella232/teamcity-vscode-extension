"use strict";

import {Container} from "inversify";
import {TYPES} from "./bll/utils/constants";
import {Settings} from "./bll/entities/settings";
import {SettingsImpl} from "./bll/entities/settingsimpl";
import {CredentialsStore} from "./bll/credentialsstore/credentialsstore";
import {InMemoryCredentialsStore} from "./bll/credentialsstore/inmemorycredentialsstore";
import {ExtensionManager} from "./extensionmanager";
import {CommandHolder} from "./commandholder";
import {NotificationWatcherImpl} from "./bll/notifications/notificationwatcherimpl";
import {NotificationWatcher} from "./bll/notifications/notificationwatcher";
import {RemoteLogin} from "./dal/remotelogin";
import {RemoteLoginImpl} from "./dal/remoteloginimpl";
import {RemoteBuildServer} from "./dal/remotebuildserver";
import {RemoteBuildServerImpl} from "./dal/remotebuildserverimpl";
import {WebLinks} from "./dal/weblinks";
import {WebLinksImpl} from "./dal/weblinksimpl";
import {CustomPatchSender} from "./bll/remoterun/patchsenderimpl";
import {PatchSender} from "./bll/remoterun/patchsender";
import {SummaryDao} from "./dal/summarydao";
import {BuildDao} from "./dal/builddao";
import {BuildDaoImpl} from "./dal/builddaoimpl";
import {SummaryDaoImpl} from "./dal/summarydaoimpl";
import {TeamCityOutput} from "./view/teamcityoutput";
import {Output} from "./view/output";
import {PatchManager} from "./bll/utils/patchmanager";
import {XmlParser} from "./bll/utils/xmlparser";
import {CvsProviderProxy} from "./dal/cvsproviderproxy";
import {SignIn} from "./bll/commands/signin";
import {SelectFilesForRemoteRun} from "./bll/commands/selectfilesforremoterun";
import {GetSuitableConfigs} from "./bll/commands/getsuitableconfigs";
import {RemoteRun} from "./bll/commands/remoterun";
import {PersistentStorageManager} from "./bll/credentialsstore/persistentstoragemanager";
import {WinPersistentCredentialsStore} from "./bll/credentialsstore/win32/win-credstore";
import {WindowsCredentialStoreApi} from "./bll/credentialsstore/win32/win-credstore-api";
import {LinuxFileApi} from "./bll/credentialsstore/linux/linux-file-api";
import {OsProxy} from "./bll/moduleproxies/osproxy";
import {ProviderManager} from "./view/providermanager";
import {SignOut} from "./bll/commands/signout";
import {ChangesProvider} from "./view/dataproviders/resourceprovider";
import {BuildProvider} from "./view/dataproviders/buildprovider";
import {OsxKeychainApi} from "./bll/credentialsstore/osx/osx-keychain-api";
import {OsxKeychain} from "./bll/credentialsstore/osx/osx-keychain-access";
import {FileTokenStorage} from "./bll/credentialsstore/linux/file-token-storage";
import {WinCredStoreParsingStreamWrapper} from "./bll/credentialsstore/win32/win-credstore-parser";
import {OsxSecurityParsingStreamWrapper} from "./bll/credentialsstore/osx/osx-keychain-parser";

export const myContainer = new Container();
myContainer.bind<Settings>(TYPES.Settings).to(SettingsImpl).inSingletonScope();
myContainer.bind<Output>(TYPES.Output).to(TeamCityOutput).inSingletonScope();
myContainer.bind<CredentialsStore>(TYPES.CredentialsStore).to(InMemoryCredentialsStore).inSingletonScope();
myContainer.bind<ExtensionManager>(TYPES.ExtensionManager).to(ExtensionManager);
myContainer.bind<CommandHolder>(TYPES.CommandHolder).to(CommandHolder);
myContainer.bind<NotificationWatcher>(TYPES.NotificationWatcher).to(NotificationWatcherImpl);
myContainer.bind<RemoteLogin>(TYPES.RemoteLogin).to(RemoteLoginImpl);
myContainer.bind<RemoteBuildServer>(TYPES.RemoteBuildServer).to(RemoteBuildServerImpl);
myContainer.bind<WebLinks>(TYPES.WebLinks).to(WebLinksImpl);
myContainer.bind<PatchSender>(TYPES.PatchSender).to(CustomPatchSender);
myContainer.bind<SummaryDao>(TYPES.SummaryDao).to(SummaryDaoImpl);
myContainer.bind<BuildDao>(TYPES.BuildDao).to(BuildDaoImpl);
myContainer.bind<PatchManager>(TYPES.PatchManager).to(PatchManager).inSingletonScope();
myContainer.bind<XmlParser>(TYPES.XmlParser).to(XmlParser).inSingletonScope();
myContainer.bind<CvsProviderProxy>(TYPES.CvsProviderProxy).to(CvsProviderProxy).inSingletonScope();
myContainer.bind<SignIn>(TYPES.SignIn).to(SignIn).inSingletonScope();
myContainer.bind<SignOut>(TYPES.SignOut).to(SignOut).inSingletonScope();
myContainer.bind<SelectFilesForRemoteRun>(TYPES.SelectFilesForRemoteRun).to(SelectFilesForRemoteRun).inSingletonScope();
myContainer.bind<GetSuitableConfigs>(TYPES.GetSuitableConfigs).to(GetSuitableConfigs).inSingletonScope();
myContainer.bind<RemoteRun>(TYPES.RemoteRun).to(RemoteRun).inSingletonScope();
myContainer.bind<PersistentStorageManager>(TYPES.PersistentStorageManager).to(PersistentStorageManager).inSingletonScope();
myContainer.bind<WindowsCredentialStoreApi>(TYPES.WindowsCredentialStoreApi).to(WindowsCredentialStoreApi).inSingletonScope();
myContainer.bind<LinuxFileApi>(TYPES.LinuxFileApi).to(LinuxFileApi).inSingletonScope();
myContainer.bind<WinPersistentCredentialsStore>(TYPES.WinPersistentCredentialsStore).to(WinPersistentCredentialsStore).inSingletonScope();
myContainer.bind<OsProxy>(TYPES.OsProxy).to(OsProxy);
myContainer.bind<ProviderManager>(TYPES.ProviderManager).to(ProviderManager).inSingletonScope();
myContainer.bind<ChangesProvider>(TYPES.ResourceProvider).to(ChangesProvider).inSingletonScope();
myContainer.bind<BuildProvider>(TYPES.BuildProvider).to(BuildProvider).inSingletonScope();
myContainer.bind<OsxKeychainApi>(TYPES.OsxKeychainApi).to(OsxKeychainApi).inSingletonScope();
myContainer.bind<OsxKeychain>(TYPES.OsxKeychain).to(OsxKeychain).inSingletonScope();
myContainer.bind<FileTokenStorage>(TYPES.FileTokenStorage).to(FileTokenStorage).inSingletonScope();
myContainer.bind<WinCredStoreParsingStreamWrapper>(TYPES.WinCredStoreParsingStreamWrapper).to(WinCredStoreParsingStreamWrapper).inSingletonScope();
myContainer.bind<OsxSecurityParsingStreamWrapper>(TYPES.OsxSecurityParsingStreamWrapper).to(OsxSecurityParsingStreamWrapper).inSingletonScope();
