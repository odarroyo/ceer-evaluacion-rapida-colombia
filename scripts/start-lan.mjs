import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const candidates = Object.values(os.networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter((entry) => entry.family === "IPv4" && !entry.internal)
  .map((entry) => entry.address);
const lanHost = candidates.find((address) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) ?? candidates[0];
if (!lanHost) throw new Error("No active IPv4 LAN address was found. Connect the Mac to the device network and retry.");

console.log(`Evaluación CEER · listener de aceptación móvil`);
console.log(`Mac:          http://127.0.0.1:3000`);
console.log(`LAN sin GPS:  http://${lanHost}:3000`);
console.log("GPS móvil:    ejecute npm run dev:mobile:tunnel en otra terminal");
console.log("Use sólo la red de pruebas confiable y datos sintéticos. Control-C detiene el listener.");

const executable = path.resolve("node_modules/.bin/next");
const nextArguments = ["dev", "--hostname", "0.0.0.0", "--port", "3000"];
const child = spawn(executable, nextArguments, {
  stdio: "inherit",
  env: { ...process.env, CEER_LAN_HOST: lanHost },
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
