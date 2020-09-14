import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { join } from 'path';
import { tmpdir } from 'os';
import { which } from '@actions/io';
import { chmodSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const TEMP_DIRECTORY: string = process.env.RUNNER_TEMP || tmpdir();

async function createScriptFile(inlineScript: string, powershell: boolean): Promise<string> {
    const fileExtension: string = powershell ? "ps1" : "sh";
    const fileName: string = `CLI_MICROSOFT365_GITHUB_ACTION_${new Date().getTime().toString()}.${fileExtension}`;
    const filePath: string = join(TEMP_DIRECTORY, fileName);
    writeFileSync(filePath, `${inlineScript}`);
    chmodSync(filePath, 0o755);

    return filePath;
}

async function deleteFile(filePath: string) {
    if (existsSync(filePath)) {
        try {
            unlinkSync(filePath);
        }
        catch (err) {
            core.warning(err.toString());
        }
    }
}

async function main() {

    try {
        await which("m365", true);
        const cliMicrosoft365ScriptPath = core.getInput("CLI_MICROSOFT365_SCRIPT_PATH");
        if (cliMicrosoft365ScriptPath) {
            core.info("ℹ️ Executing script from file...");
            if (existsSync(cliMicrosoft365ScriptPath)) {
                const fileExtension = cliMicrosoft365ScriptPath.split('.').pop();
                chmodSync(cliMicrosoft365ScriptPath, 0o755);
                if (fileExtension == "ps1") {
                    await exec('pwsh', ['-f', cliMicrosoft365ScriptPath]);
                } else {
                    await exec(`bash ${cliMicrosoft365ScriptPath}`);
                }
                core.info("✅ Script execution complete.");
            } else {
                core.error("🚨 Please check if the script path correct.");
                core.setFailed("Path incorrect.");
            }
        } else {
            const cliMicrosoft365Script: string = core.getInput("CLI_MICROSOFT365_SCRIPT");
            const cliMicrosoft365ScriptIsPS: string = core.getInput("IS_POWERSHELL");
            const isPowerShell: boolean = cliMicrosoft365ScriptIsPS == "true" ? true : false;
            if (cliMicrosoft365Script) {
                let cliMicrosoft365ScriptFilePath: string = '';
                try {
                    core.info("ℹ️ Executing script that was passed...");
                    cliMicrosoft365ScriptFilePath = await createScriptFile(cliMicrosoft365Script, isPowerShell);
                    if (isPowerShell) {
                        await exec('pwsh', ['-f', cliMicrosoft365ScriptFilePath]);
                    } else {
                        await exec(`bash ${cliMicrosoft365ScriptFilePath}`);
                    }
                    core.info("✅ Script execution complete.");
                } catch (err) {
                    core.error("🚨 Executing script failed.");
                    core.setFailed(err);
                } finally {
                    await deleteFile(cliMicrosoft365ScriptFilePath);
                }

            } else {
                core.error("🚨 Please pass either a command or a file containing commands.");
                core.setFailed("No arguments passed.");
            }
        }

    } catch (err) {
        core.error("🚨 Executing script failed.");
        core.setFailed(err);
    }
}

main();