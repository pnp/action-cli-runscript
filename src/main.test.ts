import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'os';

vi.mock('@actions/core');
vi.mock('@actions/exec');
vi.mock('@actions/io');
vi.mock('fs');

describe('CLI for Microsoft 365 GitHub Action', () => {
  let mockCore: any;
  let mockExec: any;
  let mockIo: any;
  let mockFs: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.RUNNER_TEMP = '/tmp/runner';

    mockCore = await import('@actions/core');
    mockExec = await import('@actions/exec');
    mockIo = await import('@actions/io');
    mockFs = await import('fs');

    mockCore.getInput = vi.fn();
    mockCore.info = vi.fn();
    mockCore.error = vi.fn();
    mockCore.warning = vi.fn();
    mockCore.setFailed = vi.fn();
    mockExec.exec = vi.fn().mockResolvedValue(0);
    mockIo.which = vi.fn().mockResolvedValue('/usr/local/bin/m365');
    mockFs.writeFileSync = vi.fn();
    mockFs.chmodSync = vi.fn();
    mockFs.existsSync = vi.fn().mockReturnValue(true);
    mockFs.unlinkSync = vi.fn();
  });

  describe('m365 CLI validation', () => {
    it('should fail when m365 CLI is not found on PATH', async () => {
      const whichError = new Error('m365 not found');
      mockIo.which.mockRejectedValue(whichError);
      mockCore.getInput.mockReturnValue('');
      await import('./main');

      expect(mockIo.which).toHaveBeenCalledWith('m365', true);
      expect(mockCore.error).toHaveBeenCalledWith('🚨 Executing script failed.');
      expect(mockCore.setFailed).toHaveBeenCalledWith(whichError);
    });
  });

  describe('script execution from file path', () => {
    it('should execute PowerShell script from provided path', async () => {
      const scriptPath = '/path/to/script.ps1';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return scriptPath;
        return '';
      });
      mockFs.existsSync.mockReturnValue(true);
      await import('./main');

      expect(mockFs.existsSync).toHaveBeenCalledWith(scriptPath);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(scriptPath, 0o755);
      expect(mockExec.exec).toHaveBeenCalledWith('pwsh', ['-f', scriptPath]);
      expect(mockCore.info).toHaveBeenCalledWith('✅ Script execution complete.');
    });

    it('should execute bash script from provided path', async () => {
      const scriptPath = '/path/to/script.sh';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return scriptPath;
        return '';
      });
      mockFs.existsSync.mockReturnValue(true);
      await import('./main');

      expect(mockFs.existsSync).toHaveBeenCalledWith(scriptPath);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(scriptPath, 0o755);
      expect(mockExec.exec).toHaveBeenCalledWith('bash /path/to/script.sh');
      expect(mockCore.info).toHaveBeenCalledWith('✅ Script execution complete.');
    });

    it('should fail when script path does not exist', async () => {
      const scriptPath = '/path/to/nonexistent.sh';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return scriptPath;
        return '';
      });
      mockFs.existsSync.mockReturnValue(false);
      await import('./main');

      expect(mockFs.existsSync).toHaveBeenCalledWith(scriptPath);
      expect(mockCore.error).toHaveBeenCalledWith('🚨 Please check if the script path correct.');
      expect(mockCore.setFailed).toHaveBeenCalledWith('Path incorrect.');
    });
  });

  describe('inline script execution', () => {
    it('should execute inline PowerShell script', async () => {
      const inlineScript = 'm365 status';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'true';
        return '';
      });
      await import('./main');

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toMatch(/CLI_MICROSOFT365_GITHUB_ACTION_.*\.ps1$/);
      expect(writeCall[1]).toBe(inlineScript);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(expect.stringMatching(/\.ps1$/), 0o755);
      expect(mockExec.exec).toHaveBeenCalledWith('pwsh', ['-f', expect.stringMatching(/\.ps1$/)]);
      expect(mockCore.info).toHaveBeenCalledWith('✅ Script execution complete.');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/\.ps1$/));
    });

    it('should execute inline bash script', async () => {
      const inlineScript = 'm365 status';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'false';
        return '';
      });
      await import('./main');

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toMatch(/CLI_MICROSOFT365_GITHUB_ACTION_.*\.sh$/);
      expect(writeCall[1]).toBe(inlineScript);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(expect.stringMatching(/\.sh$/), 0o755);
      expect(mockExec.exec).toHaveBeenCalledWith(expect.stringMatching(/^bash .*\.sh$/));
      expect(mockCore.info).toHaveBeenCalledWith('✅ Script execution complete.');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/\.sh$/));
    });

    it('should handle execution failure and still clean up temp file', async () => {
      const inlineScript = 'm365 status';
      const execError = new Error('Execution failed');
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'false';
        return '';
      });
      mockExec.exec.mockRejectedValue(execError);
      await import('./main');

      expect(mockCore.error).toHaveBeenCalledWith('🚨 Executing script failed.');
      expect(mockCore.setFailed).toHaveBeenCalledWith(execError);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/\.sh$/));
    });

    it('should fail when no script is provided', async () => {
      mockCore.getInput.mockReturnValue('');
      await import('./main');

      expect(mockCore.error).toHaveBeenCalledWith('🚨 Please pass either a command or a file containing commands.');
      expect(mockCore.setFailed).toHaveBeenCalledWith('No arguments passed.');
    });
  });

  describe('deleteFile function', () => {
    it('should delete file when it exists', async () => {
      const inlineScript = 'm365 status';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'false';
        return '';
      });
      mockFs.existsSync.mockReturnValue(true);
      await import('./main');

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should not call unlinkSync when file does not exist', async () => {
      const inlineScript = 'm365 status';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'false';
        return '';
      });

      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });
      mockFs.existsSync.mockReturnValue(false);

      await import('./main');

      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle unlinkSync errors gracefully', async () => {
      const inlineScript = 'm365 status';
      const unlinkError = new Error('Permission denied');
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'false';
        return '';
      });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw unlinkError;
      });
      await import('./main');

      expect(mockCore.warning).toHaveBeenCalledWith(unlinkError.toString());
    });
  });

  describe('RUNNER_TEMP environment variable', () => {
    it('should use RUNNER_TEMP when set', async () => {
      process.env.RUNNER_TEMP = '/custom/runner/temp';
      vi.resetModules();
      
      const inlineScript = 'm365 status';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'false';
        return '';
      });

      await import('./main');

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toMatch(/custom[\\\/]runner[\\\/]temp[\\\/]CLI_MICROSOFT365_GITHUB_ACTION_.*\.sh$/);
    });

    it('should fall back to tmpdir when RUNNER_TEMP is not set', async () => {
      delete process.env.RUNNER_TEMP;
      vi.resetModules();
      
      const inlineScript = 'm365 status';
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'CLI_MICROSOFT365_SCRIPT_PATH') return '';
        if (name === 'CLI_MICROSOFT365_SCRIPT') return inlineScript;
        if (name === 'IS_POWERSHELL') return 'false';
        return '';
      });
      await import('./main');

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const expectedTmpDir = tmpdir();
      expect(writeCall[0]).toContain(expectedTmpDir);
    });
  });
});
