const fs = require("fs");
const os = require("os");
const path = require("path");

const source = path.join(process.cwd(), "jio", "recharge.js");
const targetDir = path.join(os.homedir(), ".webcmd", "clis", "jio");
const target = path.join(targetDir, "recharge.js");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);

console.log(`Installed Jio Webcmd adapter: ${target}`);