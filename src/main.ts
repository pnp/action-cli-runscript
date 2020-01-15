import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { join } from 'path';
import { tmpdir } from 'os';
import { which } from '@actions/io';
import { chmodSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const TEMP_DIRECTORY: string = process.env.RUNNER_TEMP || tmpdir();

function getCurrentTime(): number {
    return new Date().getTime();
}

async function createScriptFile(inlineScript: string, powershell: boolean): Promise<string> {
    const fileExtension: string = powershell ? "ps1" : "sh";
    const fileName: string = `O365_CLI_GITHUB_ACTION_${getCurrentTime().toString()}.${fileExtension}`;
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
        await which("o365", true);
        let o365CLIScriptPath = core.getInput("O365_CLI_SCRIPT_PATH");
        if (o365CLIScriptPath) {
            core.info("ℹ️ Executing script from file...");
            if (existsSync(o365CLIScriptPath)) {
                let fileExtension = o365CLIScriptPath.split('.').pop();
                chmodSync(o365CLIScriptPath, 0o755);
                if (fileExtension == "ps1") {
                    await exec('pwsh', ['-f', o365CLIScriptPath]);
                } else {
                    await exec(`bash ${o365CLIScriptPath}`);
                }
                core.info("✅ Script execution complete.");
            } else {
                core.error("🚨 Please check if the script path correct.");
                core.setFailed("Path incorrect.");
            }
        } else {
            const o365CLIScript: string = core.getInput("O365_CLI_SCRIPT");
            const o365CLIScriptIsPS: string = core.getInput("IS_POWERSHELL");
            const isPowerShell: boolean = o365CLIScriptIsPS == "true" ? true : false;
            if (o365CLIScript) {
                let o365CLIScriptFilePath: string = '';
                try {
                    core.info("ℹ️ Executing script that was passed...");
                    o365CLIScriptFilePath = await createScriptFile(o365CLIScript, isPowerShell);
                    if (isPowerShell) {
                        await exec('pwsh', ['-f', o365CLIScriptFilePath]);
                    } else {
                        await exec(`bash ${o365CLIScriptFilePath}`);
                    }
                    core.info("✅ Script execution complete.");
                } catch (err) {
                    core.error("🚨 Executing script failed.");
                    core.setFailed(err);
                } finally {
                    await deleteFile(o365CLIScriptFilePath);
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