import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";
import minimist from "minimist";
import prompts from "prompts";
import {
  blue,
  cyan,
  green,
  lightGreen,
  red,
  reset,
  yellow,
} from "kolorist";

const TARGET_DIR = "TARGET_DIR";

// Avoids autoconversion to number of the project name by defining that the args
// non associated with an option ( _ ) needs to be parsed as a string. See #4606
const argv = minimist<{
  t?: string;
  template?: string;
}>(process.argv.slice(2), { string: ["_"] });
const cwd = process.cwd();

type ColorFunc = (str: string | number) => string;
interface Framework {
  name: string;
  display: string;
  color: ColorFunc;
  variants: FrameworkVariant[];
};
interface FrameworkVariant {
  name: string;
  display: string;
  color: ColorFunc;
  customCommand?: string;
};

function generateDegitCommand(repository: string, targetDir = TARGET_DIR) {
  return `npx degit ${repository} ${targetDir}`;
}

const FRAMEWORKS: Framework[] = [
  {
    name: "vue",
    display: "Vue",
    color: green,
    variants: [
      {
        name: "boot-vue",
        display: "Vue Bootstrapper(Vue 3, TypeScript, etc.)",
        color: blue,
        customCommand: generateDegitCommand("kirklin/boot-vue"),
      },
      {
        name: "boot-nuxt3",
        display: "Nuxt 3 Bootstrapper(Vue 3, TypeScript, etc.)",
        color: blue,
        customCommand: generateDegitCommand("kirklin/boot-nuxt3"),
      },
      {
        name: "custom-create-vue",
        display: "Custom Vue Setup ↗",
        color: green,
        customCommand: `npm create vue@latest ${TARGET_DIR}`,
      },
      {
        name: "custom-nuxt",
        display: "Custom Nuxt Setup ↗",
        color: lightGreen,
        customCommand: `npm exec nuxi init ${TARGET_DIR}`,
      },
    ],
  },
  {
    name: "react",
    display: "React",
    color: cyan,
    variants: [
      {
        name: "boot-react",
        display: "React Bootstrapper(TypeScript, etc.)",
        color: blue,
        customCommand: generateDegitCommand("kirklin/boot-react"),
      },
    ],
  },
  {
    name: "kirklin",
    display: "Kirklin Templates",
    color: cyan,
    variants: [
      {
        name: "celeris-web",
        display: "Celeris Web: Highly Performant Vue 3 + Vite + TypeScript template with advanced feature",
        color: blue,
        customCommand: generateDegitCommand("kirklin/celeris-web"),
      },
      {
        name: "boot-mini-program",
        display: "WeChat Mini Program Template (Vue 3, Taro, TypeScript, Uno CSS, etc.)",
        color: green,
        customCommand: generateDegitCommand("kirklin/boot-mini-program"),
      },
      {
        name: "boot-uni",
        display: "uni-app Starter Template(Vue 3, TypeScript, etc.)",
        color: green,
        customCommand: generateDegitCommand("kirklin/boot-unplugin"),
      },
      {
        name: "boot-webext",
        display: "Chrome Extension Starter Template(Vue 3, TypeScript, etc.)",
        color: yellow,
        customCommand: generateDegitCommand("kirklin/boot-webext"),
      },
      {
        name: "boot-unplugin",
        display: "unplugin Starter Template",
        color: blue,
        customCommand: generateDegitCommand("kirklin/boot-unplugin"),
      },
      {
        name: "boot-vue-ui-library",
        display: "Vue UI Library Starter Template",
        color: blue,
        customCommand: generateDegitCommand("kirklin/boot-vue-ui-library"),
      },
      {
        name: "boot-slidev",
        display: "Slides Starter Template",
        color: blue,
        customCommand: generateDegitCommand("kirklin/boot-slidev"),
      },
    ],
  },
  {
    name: "others",
    display: "Other Templates",
    color: reset,
    variants: [
      {
        name: "create-vite",
        display: "Official Vite Template ↗",
        color: reset,
        customCommand: `npm create vite@latest ${TARGET_DIR}`,
      },
    ],
  },
];

const TEMPLATES = FRAMEWORKS.map(
  f => (f.variants && f.variants.map(v => v.name)) || [f.name],
).reduce((a, b) => a.concat(b), []);

const renameFiles: Record<string, string | undefined> = {
  _gitignore: ".gitignore",
};

const defaultTargetDir = "app-project";

async function init() {
  const argTargetDir = formatTargetDir(argv._[0]);
  const argTemplate = argv.template || argv.t;

  let targetDir = argTargetDir || defaultTargetDir;
  const getProjectName = () =>
    targetDir === "." ? path.basename(path.resolve()) : targetDir;

  let result: prompts.Answers<
      "projectName" | "overwrite" | "packageName" | "framework" | "variant"
  >;

  try {
    result = await prompts(
      [
        {
          type: argTargetDir ? null : "text",
          name: "projectName",
          message: reset("Project name:"),
          initial: defaultTargetDir,
          onState: (state) => {
            targetDir = formatTargetDir(state.value) || defaultTargetDir;
          },
        },
        {
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : "confirm",
          name: "overwrite",
          message: () =>
            `${targetDir === "."
              ? "Current directory"
              : `Target directory "${targetDir}"`
                 } is not empty. Remove existing files and continue?`,
        },
        {
          type: (_, { overwrite }: { overwrite?: boolean }) => {
            if (overwrite === false) {
              throw new Error(`${red("✖")} Operation cancelled`);
            }
            return null;
          },
          name: "overwriteChecker",
        },
        {
          type: () => (isValidPackageName(getProjectName()) ? null : "text"),
          name: "packageName",
          message: reset("Package name:"),
          initial: () => toValidPackageName(getProjectName()),
          validate: dir =>
            isValidPackageName(dir) || "Invalid package.json name",
        },
        {
          type:
                argTemplate && TEMPLATES.includes(argTemplate) ? null : "select",
          name: "framework",
          message:
                typeof argTemplate === "string" && !TEMPLATES.includes(argTemplate)
                  ? reset(
                        `"${argTemplate}" isn't a valid template. Please choose from below: `,
                  )
                  : reset("Select a framework:"),
          initial: 0,
          choices: FRAMEWORKS.map((framework) => {
            const frameworkColor = framework.color;
            return {
              title: frameworkColor(framework.display || framework.name),
              value: framework,
            };
          }),
        },
        {
          type: (framework: Framework) =>
            framework && framework.variants ? "select" : null,
          name: "variant",
          message: reset("Select a variant:"),
          choices: (framework: Framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color;
              return {
                title: variantColor(variant.display || variant.name),
                value: variant.name,
              };
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error(`${red("✖")} Operation cancelled`);
        },
      },
    );
  } catch (cancelled: any) {
    console.log(cancelled.message);
    return;
  }

  // user choice associated with prompts
  const { framework, overwrite, packageName, variant } = result;

  const root = path.join(cwd, targetDir);

  if (overwrite) {
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  // determine template
  let template: string = variant || framework?.name || argTemplate;
  let isReactSwc = false;
  if (template.includes("-swc")) {
    isReactSwc = true;
    template = template.replace("-swc", "");
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : "npm";
  const isYarn1 = pkgManager === "yarn" && pkgInfo?.version.startsWith("1.");

  const { customCommand }
  = FRAMEWORKS.flatMap(f => f.variants).find(v => v.name === template) ?? {};

  if (customCommand) {
    const fullCustomCommand = customCommand
      .replace(/^npm create /, () => {
        // `bun create` uses it's own set of templates,
        // the closest alternative is using `bun x` directly on the package
        if (pkgManager === "bun") {
          return "bun x create-";
        }
        return `${pkgManager} create `;
      })
    // Only Yarn 1.x doesn't support `@version` in the `create` command
      .replace("@latest", () => (isYarn1 ? "" : "@latest"))
      .replace(/^npm exec/, () => {
        // Prefer `pnpm dlx`, `yarn dlx`, or `bun x`
        if (pkgManager === "pnpm") {
          return "pnpm dlx";
        }
        if (pkgManager === "yarn" && !isYarn1) {
          return "yarn dlx";
        }
        if (pkgManager === "bun") {
          return "bun x";
        }
        // Use `npm exec` in all other cases,
        // including Yarn 1.x and other custom npm clients.
        return "npm exec";
      });

    const [command, ...args] = fullCustomCommand.split(" ");
    // we replace TARGET_DIR here because targetDir may include a space
    const replacedArgs = args.map(arg => arg.replace(TARGET_DIR, targetDir));
    const { status } = spawn.sync(command, replacedArgs, {
      stdio: "inherit",
    });
    process.exit(status ?? 0);
  }

  console.log(`\nScaffolding project in ${root}...`);

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    "../..",
      `boot-${template}`,
  );

  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file);
    if (content) {
      fs.writeFileSync(targetPath, content);
    } else {
      copy(path.join(templateDir, file), targetPath);
    }
  };

  const files = fs.readdirSync(templateDir);
  for (const file of files.filter(f => f !== "package.json")) {
    write(file);
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, "package.json"), "utf-8"),
  );

  pkg.name = packageName || getProjectName();

  write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

  if (isReactSwc) {
    setupReactSwc(root, template.endsWith("-ts"));
  }

  const cdProjectName = path.relative(cwd, root);
  console.log("\nDone. Now run:\n");
  if (root !== cwd) {
    console.log(
        `  cd ${
            cdProjectName.includes(" ") ? `"${cdProjectName}"` : cdProjectName
        }`,
    );
  }
  switch (pkgManager) {
    case "yarn":
      console.log("  yarn");
      console.log("  yarn dev");
      break;
    default:
      console.log(`  ${pkgManager} install`);
      console.log(`  ${pkgManager} run dev`);
      break;
  }
  console.log();
}

function formatTargetDir(targetDir: string | undefined) {
  return targetDir?.trim().replace(/\/+$/g, "");
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName,
  );
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z\d\-~]+/g, "-");
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function isEmpty(path: string) {
  const files = fs.readdirSync(path);
  return files.length === 0 || (files.length === 1 && files[0] === ".git");
}

function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    if (file === ".git") {
      continue;
    }
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true });
  }
}

function pkgFromUserAgent(userAgent: string | undefined) {
  if (!userAgent) {
    return undefined;
  }
  const pkgSpec = userAgent.split(" ")[0];
  const pkgSpecArr = pkgSpec.split("/");
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  };
}

function setupReactSwc(root: string, isTs: boolean) {
  editFile(path.resolve(root, "package.json"), (content) => {
    return content.replace(
      /"@vitejs\/plugin-react": ".+?"/,
      "\"@vitejs/plugin-react-swc\": \"^3.3.2\"",
    );
  });
  editFile(
    path.resolve(root, `vite.config.${isTs ? "ts" : "js"}`),
    (content) => {
      return content.replace("@vitejs/plugin-react", "@vitejs/plugin-react-swc");
    },
  );
}

function editFile(file: string, callback: (content: string) => string) {
  const content = fs.readFileSync(file, "utf-8");
  fs.writeFileSync(file, callback(content), "utf-8");
}

init().catch((e) => {
  console.error(e);
});
