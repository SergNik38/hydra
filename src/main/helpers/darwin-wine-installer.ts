import path from "node:path";

import { prepareDarwinWinePrefix } from "./darwin-wine-launch";

export const resolveDarwinInstallerCommand = async (
  filePath: string,
  winePrefixPath: string
): Promise<{
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}> => {
  const wineBinaryPath = await prepareDarwinWinePrefix(winePrefixPath);

  return {
    command: wineBinaryPath,
    args: [filePath],
    cwd: path.dirname(filePath),
    env: { ...process.env, WINEPREFIX: winePrefixPath },
  };
};
