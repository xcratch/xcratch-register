#!/usr/bin/env node
'use strict'

/**
 * Register an extension in the local Scratch
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
// const projectJson = require('../package.json');
const yargs = require('yargs')

const argv = yargs
    .option('id',
        {
            description: 'ID of the extension',
            type: 'string',
            demandOption: true
        })
    .option('dir',
        {
            description: 'Path of the extension',
            type: 'string'
        })
    .option('gui',
        {
            description: 'Path of scratch-gui',
            type: 'string',
            default: '../scratch-gui'
        })
    .option('vm',
        {
            description: 'Path of scratch-vm',
            type: 'string'
        })
    .option('block',
        {
            description: 'Path of block',
            type: 'string',
            default: './src/vm/extensions/block'
        })
    .option('entry',
        {
            description: 'Path of entry',
            type: 'string',
            default: './src/gui/lib/libraries/extensions/entry'
        })
    .option('base',
        {
            description: 'Scratch to install the extension',
            type: 'string'
        })
    .option('link',
        {
            description: 'Whether the extension is installed as link or not (copy)',
            alias: 'L',
            type: 'boolean',
            default: false
        })
    .option('url',
        {
            description: 'URL of the extension',
            type: 'string'
        })
    .option('core',
        {
            description: 'Whether the extension appears on the editor at open',
            alias: 'C',
            type: 'boolean',
            default: false
        })
    .option('use',
        {
            description: 'Array of directory names to be link-back from the scratch-vm when --link',
            type: 'array'
        })
    .help()
    .argv

// Make symbolic link
function makeSymbolicLink(to, from) {
    try {
        const stats = fs.lstatSync(from);
        if (stats.isSymbolicLink()) {
            if (fs.readlinkSync(from) === to) {
                console.log(`Already exists link: ${from} -> ${fs.readlinkSync(from)}`);
                return;
            }
            fs.unlink(from);
        } else {
            fs.renameSync(from, `${from}~`);
        }
    } catch (err) {
        // File not exists.
    }
    fs.symlinkSync(to, from, 'dir');
    console.log(`Make link: ${from} -> ${fs.readlinkSync(from)}`);
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        entry.isDirectory() ?
            copyDir(srcPath, destPath) :
            fs.copyFileSync(srcPath, destPath);
    }
}


const ExtId = argv.id;

const ExtDirName = argv.dir ?
    argv.dir :
    ExtId;

const GuiRoot = path.resolve(process.cwd(), argv.gui);
const VmRoot = argv.vm ?
    path.resolve(process.cwd(), argv.vm) :
    path.resolve(GuiRoot, './node_modules/scratch-vm');

const ExtBlockPath = path.resolve(process.cwd(), argv.block);

const ExtEntryPath = path.resolve(process.cwd(), argv.entry);

const VmExtDirPath = path.resolve(VmRoot, `src/extensions/${ExtDirName}`);
const GuiExtDirPath = path.resolve(GuiRoot, `src/lib/libraries/extensions/${ExtDirName}`);

const EntryFile = path.resolve(GuiExtDirPath, './index.jsx');
const BlockFile = path.resolve(VmExtDirPath, './index.js');

const VmExtManagerFile = path.resolve(VmRoot, './src/extension-support/extension-manager.js');
const VmVirtualMachineFile = path.resolve(VmRoot, './src/virtual-machine.js');
const GuiExtIndexFile = path.resolve(GuiRoot, './src/lib/libraries/extensions/index.jsx');

// Apply patch if it was the original Scratch
if (argv.base === 'LLK') {
    try {
        execSync(`cd ${VmRoot} && patch -p1 -N -s < ${path.resolve(__dirname, 'patch/llk-scratch-vm.patch')}`);
        console.log(`Apply patch: llk-scratch-vm.patch`);
        execSync(`cd ${GuiRoot} && patch -p1 -N -s < ${path.resolve(__dirname, 'patch/llk-scratch-gui.patch')}`);
        console.log(`Apply patch: llk-scratch-gui.patch`);
    } catch (err) {
        console.error(err);
    }
}

if (argv.link) {
    // Make symbolic link in scratch-vm. 
    makeSymbolicLink(ExtBlockPath, VmExtDirPath);
    // Make symbolic link in scratch-gui. 
    makeSymbolicLink(ExtEntryPath, GuiExtDirPath);
    // Setup dev-server to live-reload when the block code was changed.
    const WebPackConfigFile = path.resolve(GuiRoot, 'webpack.config.js');
    let webpackConfig = fs.readFileSync(WebPackConfigFile, 'utf-8');
    webpackConfig = webpackConfig.replace(/symlinks:\s*false/, `symlinks: true`);
    fs.writeFileSync(WebPackConfigFile, webpackConfig);
    // Make links to VM sources for file resolving by dev-server.
    if (argv.use) {
        argv.use.forEach(dir => {
            makeSymbolicLink(path.resolve(VmRoot, 'src', dir), path.resolve(ExtBlockPath, '../../', dir));
        });
    }
} else {
    fs.renameSync(VmExtDirPath, `${VmExtDirPath}~`);
    // Copy block dir to scratch-vm. 
    copyDir(ExtBlockPath, VmExtDirPath);
    console.log(`copy dir ${ExtBlockPath} -> ${VmExtDirPath}`);
    fs.renameSync(GuiExtDirPath, `${GuiExtDirPath}~`);
    // Copy entry dir in scratch-gui. 
    copyDir(ExtEntryPath, GuiExtDirPath);
    console.log(`copy dir ${ExtEntryPath} -> ${GuiExtDirPath}`);
}

// Replace URL in entry and block code.
if (argv.url) {
    const url = argv.url;
    // Replace URL in entry
    let entryCode = fs.readFileSync(EntryFile, 'utf-8');
    entryCode = entryCode.replace(/extensionURL:\s*[^,]+,/m, `extensionURL: '${url}',`);
    fs.writeFileSync(EntryFile, entryCode);
    console.log(`Entry: extensionURL = ${url}`);

    // Replace URL in entry
    let blockCode = fs.readFileSync(BlockFile, 'utf-8');
    blockCode = blockCode.replace(/let\s+extensionURL\s+=\s+[^;]+;/m, `let extensionURL = '${url}';`);
    fs.writeFileSync(BlockFile, blockCode);
    console.log(`Block: extensionURL = ${url}`);
}

// Add the extension to extension manager of scratch-vm. 
let managerCode = fs.readFileSync(VmExtManagerFile, 'utf-8');
if (managerCode.includes(`builtinExtensions.${ExtId}`)) {
    console.log(`Already registered in manager: ${ExtId}`);
} else {
    fs.copyFileSync(VmExtManagerFile, `${VmExtManagerFile}.orig`);
    managerCode = managerCode.replace(/builtinExtensions = {[\s\S]*?};/, `$&\n\nbuiltinExtensions.${ExtId} = () => {\n    const ext = require('../extensions/${ExtDirName}');\n    return ext.default ? ext.default : ext;\n};`);
    fs.writeFileSync(VmExtManagerFile, managerCode);
    console.log(`Registered in manager: ${ExtId}`);
}

if (argv.core) {
    // Add the extension as a core extension. 
    let vmCode = fs.readFileSync(VmVirtualMachineFile, 'utf-8');
    if (vmCode.includes(`CORE_EXTENSIONS.push('${ExtId}')`)) {
        console.log(`Already added as a core extension: ${ExtId}`);
    } else {
        fs.copyFileSync(VmVirtualMachineFile, `${VmVirtualMachineFile}.orig`);
        vmCode = vmCode.replace(/CORE_EXTENSIONS = \[[\s\S]*?\];/, `$&\n\nCORE_EXTENSIONS.push('${ExtId}');`);
        fs.writeFileSync(VmVirtualMachineFile, vmCode);
        console.log(`Add as a core extension: ${ExtId}`);
    }
}

// Add the extension to list of scratch-gui. 
let indexCode = fs.readFileSync(GuiExtIndexFile, 'utf-8');
if (indexCode.includes(`import ${ExtId}`)) {
    console.log(`Already added to extension list: ${ExtId}`);
} else {
    fs.copyFileSync(GuiExtIndexFile, `${GuiExtIndexFile}.orig`);
    const immutableDefault = /^\s*export\s+default\s+\[/m
    if (immutableDefault.test(indexCode)) {
        // Make the list of extensions mutable.
        indexCode = indexCode.replace(immutableDefault, 'const extensions = [');
        indexCode += '\nexport default extensions;';
    }
    indexCode += `\n// Injected for extra extension ${ExtId}`;
    indexCode += `\nimport ${ExtId} from './${ExtDirName}/index.jsx';`;
    indexCode += `\nextensions.unshift(${ExtId});`;
    indexCode += '\n';
    fs.writeFileSync(GuiExtIndexFile, indexCode);
    console.log(`Added to extension list: ${ExtId}`);
}
