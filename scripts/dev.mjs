import { spawn } from "node:child_process";

const webArgs = ["run", "dev:web"];

if (process.env.QUORUMMIND_WEB_HOST) {
  webArgs.push("--", "--host", process.env.QUORUMMIND_WEB_HOST);
}

const commands = [
  ["npm", ["run", "server"]],
  ["npm", webArgs]
];

const children = commands.map(([command, args]) =>
  spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  })
);

let shuttingDown = false;

for (const child of children) {
  child.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const processToStop of children) {
      if (!processToStop.killed) {
        processToStop.kill("SIGTERM");
      }
    }
    process.exit(code ?? 0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
    process.exit(0);
  });
}
