#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

function run(command, options = {}) {
  return execSync(command, {
    cwd: rootDir,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
  });
}

function usage() {
  console.log("Usage: npm run version:push -- <patch|minor|major|x.y.z> [--version x.y.z]");
  console.log("Example: npm run version:push -- patch");
  console.log("Example: npm run version:push -- 0.2.0");
  console.log("Example: npm run version:push -- patch --version 0.2.0");
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const bumpKinds = new Set(["patch", "minor", "major"]);
const explicitVersionRegex = /^\d+\.\d+\.\d+$/;

let bumpInput = args.find((arg) => !arg.startsWith("-")) || "patch";
const versionFlagIndex = args.findIndex((arg) => arg === "--version" || arg === "-v");
if (versionFlagIndex !== -1) {
  const flaggedVersion = args[versionFlagIndex + 1];
  if (!flaggedVersion || !explicitVersionRegex.test(flaggedVersion)) {
    console.error("Invalid --version value. Expected x.y.z");
    usage();
    process.exit(1);
  }
  bumpInput = flaggedVersion;
}

if (!bumpKinds.has(bumpInput) && !explicitVersionRegex.test(bumpInput)) {
  console.error("Invalid version input.");
  usage();
  process.exit(1);
}

try {
  const status = run("git status --porcelain", { capture: true }).trim();
  if (status.length > 0) {
    console.error("Working tree is not clean. Commit or stash changes first.");
    process.exit(1);
  }

  const branch = run("git rev-parse --abbrev-ref HEAD", { capture: true }).trim();
  if (branch !== "master") {
    console.error(`Run this from master (current: ${branch}).`);
    process.exit(1);
  }

  run("git fetch --tags origin");

  run(`npm version ${bumpInput} --no-git-tag-version`);

  const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;
  const tag = `v${version}`;

  const existingTag = run(`git tag -l ${tag}`, { capture: true }).trim();
  if (existingTag === tag) {
    console.error(`Tag ${tag} already exists.`);
    process.exit(1);
  }

  const filesToAdd = ["package.json"];
  if (fs.existsSync(path.join(rootDir, "package-lock.json"))) {
    filesToAdd.push("package-lock.json");
  }

  run(`git add ${filesToAdd.join(" ")}`);
  run(`git commit -m "chore(release): ${tag}"`);
  run(`git tag ${tag}`);
  run("git push origin master");
  run(`git push origin ${tag}`);

  console.log(`Released ${tag} successfully.`);
} catch (error) {
  if (error instanceof Error && "message" in error) {
    console.error(error.message);
  }
  process.exit(1);
}