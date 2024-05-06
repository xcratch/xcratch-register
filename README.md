> :warning: **Development of this tool has been terminated.**
Projects created with the latest [xcratch-create](https://github.com/xcratch/xcratch-create) do not need this tool.

# Xcratch Command to Register Extension
This command supports to register an extension in [Xcratch: Extendable Scratch3 Programming Environment](https://xcratch.github.io/).

## How to Register an Extension

`xcratch-register` is a Node executable script to register an extension as a pre-installed extension in Xcratch.

This command adds a extension in a local Scratch server. It makes links of source path on local scratch-vm/scratch-gui, and modifies code of the Scratch to appear the extension in its extension selector. 

```sh
cd xcx-my-extension
npx xcratch-register --link -C --id=extensionID --gui="../scratch-gui"
```

This command accepts these command-line arguments.

- --base : base code to register in (optional, options: "LLK")
- --link : use symbolic link instead of copy sources
- --id : extensionID of this extension
- --dir : directory name of the extension will be copied (optional, default: extensionID)
- --gui : location of scratch-gui from current dir (optional, default: "../scratch-gui")
- --vm : location of scratch-vm form current dir (optional, default: "gui/node_modules/scratch-vm")
- --url : URL to get this module as a loadable extension for Xcratch (optional)
- -C : make the extension as a member of core-extensions


After the extension is registered, start dev-server in scratch-gui.

```sh
../scratch-gui/npm run start -- --https
```

Open https://localhost:8601 with a web browser to check the extension is installed on the local Scratch editor.


## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />Feel free to check [issues page](https://github.com/xcratch/xcratch-register/issues). 
## Show your support

Give a ⭐️ if this project helped you!


## 📝 License

Copyright © 2021 [Koji Yokokawa](https://github.com/yokobond).<br />
This project is [MIT](https://github.com/xcratch/xcratch-register/blob/master/LICENSE) licensed.
