import { execFile } from "node:child_process";

const ROSETTA_PROBE_COMMAND = "/usr/bin/arch";
const ROSETTA_PROBE_ARGS = ["-x86_64", "/usr/bin/true"];

export type RosettaProbeRunner = (
  command: string,
  args: string[]
) => Promise<number>;

const runProbe: RosettaProbeRunner = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, (error) => {
      if (!error) {
        resolve(0);
        return;
      }
      resolve(typeof error.code === "number" ? error.code : 1);
    });
  });

export const needsRosetta = (arch: string = process.arch): boolean =>
  arch === "arm64";

export const isRosettaAvailable = async (
  run: RosettaProbeRunner = runProbe
): Promise<boolean> => {
  try {
    return (await run(ROSETTA_PROBE_COMMAND, ROSETTA_PROBE_ARGS)) === 0;
  } catch {
    return false;
  }
};
