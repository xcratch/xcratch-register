#!/usr/bin/env node
'use strict'

/**
 * Register an extension in the local Scratch
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function getArgs() {
    const args = {};
    process.argv
        .slice(2, process.argv.length)
        .forEach(arg => {
            if (arg.slice(0, 2) === '--') {
                // long arg
                const longArg = arg.split('=');
                const longArgFlag = longArg[0].slice(2, longArg[0].length);
                const longArgValue = longArg.length > 1 ? longArg[1] : true;
                args[longArgFlag] = longArgValue;
            }
            else if (arg[0] === '-') {
                // flags
                const flags = arg.slice(1, arg.length).split('');
                flags.forEach(flag => {
                    args[flag] = true;
                });
            }
        });
    return args;
}

const args = getArgs();

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

if (!args['id']) {
    process.stderr.write('"--id <extensionID>" is not set\n');
    process.exit(1);
}

const ExtId = args['id'];

const ExtDirName = args['dir'] ?
    args['dir'] :
    ExtId;

const GuiRoot = args['gui'] ?
    path.resolve(process.cwd(), args['gui']) :
    path.resolve(process.cwd(), '../scratch-gui');
const VmRoot = args['vm'] ?
    path.resolve(process.cwd(), args['vm']) :
    path.resolve(GuiRoot, './node_modules/scratch-vm');

const ExtBlockPath = args['block'] ?
    path.resolve(process.cwd(), args['block']) :
    path.resolve(process.cwd(), './src/block');

const ExtEntryPath = args['entry'] ?
    path.resolve(process.cwd(), args['entry']) :
    path.resolve(process.cwd(), './src/entry');

const VmExtDirPath = path.resolve(VmRoot, `src/extensions/${ExtDirName}`);
const GuiExtDirPath = path.resolve(GuiRoot, `src/lib/libraries/extensions/${ExtDirName}`);

const EntryFile = path.resolve(GuiExtDirPath, './index.jsx');
const BlockFile = path.resolve(VmExtDirPath, './index.js');

const VmExtManagerFile = path.resolve(VmRoot, './src/extension-support/extension-manager.js');
const VmVirtualMachineFile = path.resolve(VmRoot, './src/virtual-machine.js');
const GuiExtIndexFile = path.resolve(GuiRoot, './src/lib/libraries/extensions/index.jsx');

// Apply patch if it was the original Scratch
if (args['base'] === 'LLK') {
    try {
        execSync(`cd ${VmRoot} && patch -p1 -N -s < ${path.resolve(__dirname, 'patch/llk-scratch-vm.patch')}`);
        console.log(`Apply patch: llk-scratch-vm.patch`);
        execSync(`cd ${GuiRoot} && patch -p1 -N -s < ${path.resolve(__dirname, 'patch/llk-scratch-gui.patch')}`);
        console.log(`Apply patch: llk-scratch-gui.patch`);
    } catch (err) {
        console.error(err);
    }
}

if (args['link']) {
    // Make symbolic link in scratch-vm. 
    makeSymbolicLink(ExtBlockPath, VmExtDirPath);
    // Make symbolic link in scratch-gui. 
    makeSymbolicLink(ExtEntryPath, GuiExtDirPath);
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
if (args['url']) {
    const url = args['url'];
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

if (args['C']) {
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
