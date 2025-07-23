const openFiles = {}
let currentPath = "";
let currentDir = "";
let selectedItem = null;
let viewMode = "tree"; // "tree" or "flat"
const expandedDirs = new Set();

// Terminal variables
let socket = null;
let terminalHistory = [];
let historyIndex = -1;
let isTerminalConnected = false;

const ICONS = {
    folder: "vscode-icons:default-folder",
    folderOpen: "vscode-icons:default-folder-opened",

    py: "vscode-icons:file-type-python",
    js: "vscode-icons:file-type-js-official",
    jsx: "vscode-icons:file-type-reactjs",
    ts: "vscode-icons:file-type-typescript-official",
    tsx: "vscode-icons:file-type-reactts",
    json: "vscode-icons:file-type-json",
    html: "vscode-icons:file-type-html",
    css: "vscode-icons:file-type-css",
    scss: "vscode-icons:file-type-scss",
    less: "vscode-icons:file-type-less",
    txt: "vscode-icons:file-type-text",
    md: "vscode-icons:file-type-markdown",
    pdf: "vscode-icons:file-type-pdf",
    jpg: "vscode-icons:file-type-image",
    jpeg: "vscode-icons:file-type-image",
    png: "vscode-icons:file-type-image",
    gif: "vscode-icons:file-type-image",
    svg: "vscode-icons:file-type-svg",
    zip: "vscode-icons:file-type-zip",
    xml: "vscode-icons:file-type-xml",
    yml: "vscode-icons:file-type-yaml",
    yaml: "vscode-icons:file-type-yaml",
    php: "vscode-icons:file-type-php",
    java: "vscode-icons:file-type-java",
    cpp: "vscode-icons:file-type-cpp",
    c: "vscode-icons:file-type-c",
    go: "vscode-icons:file-type-go",
    rs: "vscode-icons:file-type-rust",
    rb: "vscode-icons:file-type-ruby",

    sh: "vscode-icons:file-type-shell",
    csv: "vscode-icons:file-type-csv",
    log: "vscode-icons:file-type-log",
    dockerfile: "vscode-icons:file-type-docker",
    dotenv: "vscode-icons:file-type-env",
    env: "vscode-icons:file-type-env",
    makefile: "vscode-icons:file-type-makefile",
    ipynb: "vscode-icons:file-type-jupyter",
    vue: "vscode-icons:file-type-vue",
    svelte: "vscode-icons:file-type-svelte",
    prisma: "vscode-icons:file-type-prisma",
    toml: "vscode-icons:file-type-toml",
    ini: "vscode-icons:file-type-settings",
    lock: "vscode-icons:file-type-lock",
    sql: "vscode-icons:file-type-sql",
    scss: "vscode-icons:file-type-scss",
    less: "vscode-icons:file-type-less",
    yml: "vscode-icons:file-type-yaml",
    yaml: "vscode-icons:file-type-yaml",

    default: "vscode-icons:default-file"
};

let terminals = [];
let activeTerminalIdx = 0;

navigator.permissions.query({ name: 'clipboard-write' }).then(result => {
    console.log(result.state); // "granted", "prompt", or "denied"
});



function addTerminalTab() {
    const idx = terminals.length;
    // Create container for output+input
    const tabPanel = document.createElement('div');
    tabPanel.className = 'terminal-tab-panel';
    tabPanel.innerHTML = `
        <div class="terminal-output" id="terminal-output-${idx}" style="flex:1; padding:8px; overflow-y:auto; background:#0c0c0c; color:#e0e0e0;"></div>
        <input type="text" class="terminal-input" id="terminal-input-${idx}" placeholder="Type command and press Enter...">
    `;
    document.getElementById('terminal-tabs-content').appendChild(tabPanel);

    // Create socket & history for this terminal
    let socket = io();
    let history = [], hidx = -1;
    socket.on('connect', () => { socket.emit('start_terminal', { working_dir: currentDir || '' }); });
    socket.on('terminal_output', d => {
        appendToTerminalTab(idx, d.data);
    });
    socket.on('terminal_error', d => {
        appendToTerminalTab(idx, d.message, 'error');
    });

    // Keyboard handler (arrow/history etc)
    let input = tabPanel.querySelector('.terminal-input');

    input.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Spacebar') {
            const char = e.key;
            if (socket && isTerminalConnected) {
                socket.emit('terminal_input', { data: char });
            }
            e.preventDefault();
        }

        // Ctrl + C => Send SIGINT (simulate)
        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            if (socket && isTerminalConnected) {
                socket.emit('terminal_input', { data: '\x03' }); // ASCII 3 = Ctrl+C
            }
            return;
        }

        // Ctrl + L => Clear screen
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            clearTerminal();
            return;
        }

        // Ctrl + A => Move cursor to start
        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            input.setSelectionRange(0, 0);
            return;
        }

        // Ctrl + E => Move cursor to end
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            const len = input.value.length;
            input.setSelectionRange(len, len);
            return;
        }

        // Ctrl + U => Clear entire line
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            input.value = '';
            return;
        }

        // Ctrl + K => Clear from cursor to end
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            const cursor = input.selectionStart;
            input.value = input.value.slice(0, cursor);
            return;
        }

        // Ctrl + D => Simulate detach or exit
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            socket.emit('terminal_input', { data: '\x04' }); // ASCII 4 = Ctrl+D
            return;
        }
        if (e.key === 'Enter') {
            const command = input.value;
            if (command.trim()) {
                history.push(command);
                hidx = history.length;
                socket.emit('terminal_input', { data: command + '\n' });
                input.value = '';
            }
        }
        else if (e.key === ' ') {
            e.preventDefault(); // Prevent scrolling
            terminalInput.value += ' '; // Insert space visually
            const event = new Event('input', { bubbles: true });
            terminalInput.dispatchEvent(event);
        }
        else if (e.key == "ArrowUp") { e.preventDefault(); if (hidx > 0) { input.value = history[--hidx]; } }
        else if (e.key == "ArrowDown") { e.preventDefault(); if (hidx < history.length - 1) input.value = history[++hidx]; else hidx = history.length, input.value = ''; }
    });

    // let input = tabPanel.querySelector('.terminal-input');
    // setupTerminalInputHandler(input, idx, socket, history);

    terminals.push({ socket, panel: tabPanel, input, output: tabPanel.querySelector('.terminal-output'), history, hidx });

    renderTerminalTabs();
    setActiveTerminal(idx);
}

function renderTerminalTabs() {
    const bar = document.getElementById('terminal-tabs');
    bar.innerHTML = '';
    terminals.forEach((term, idx) => {
        const btn = document.createElement('button');
        btn.className = 'terminal-tab-btn' + (activeTerminalIdx == idx ? ' active' : '');
        btn.textContent = 'T' + (idx + 1);
        btn.onclick = () => setActiveTerminal(idx);
        // Close button
        const close = document.createElement('span');
        close.innerHTML = '&times;';
        close.className = 'terminal-tab-close';
        close.onclick = (e) => { e.stopPropagation(); closeTerminalTab(idx); }
        btn.appendChild(close);
        bar.appendChild(btn);
    });
}

function setActiveTerminal(idx) {
    activeTerminalIdx = idx;
    [...document.querySelectorAll('.terminal-tab-panel')].forEach((el, i) => el.classList.toggle('active', i == idx));
    renderTerminalTabs();
}

function closeTerminalTab(idx) {
    terminals[idx].socket.disconnect();
    terminals.splice(idx, 1);
    const panels = document.querySelectorAll('.terminal-tab-panel');
    panels[idx].remove();
    if (activeTerminalIdx >= terminals.length) activeTerminalIdx = terminals.length - 1;
    setActiveTerminal(activeTerminalIdx);
    renderTerminalTabs();
}

function appendToTerminalTab(idx, text, type = 'normal') {
    const ansi_up = new AnsiUp();
    ansi_up.use_classes = false;
    const html = ansi_up.ansi_to_html(text);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    if (type === 'error') wrapper.style.color = '#f48771';
    terminals[idx].output.appendChild(wrapper);
    terminals[idx].output.scrollTop = terminals[idx].output.scrollHeight;
}



function getIconURL(fileName, isFolder, isExpanded = false) {
    if (isFolder) {
        const iconName = isExpanded ? ICONS.folderOpen : ICONS.folder;
        return `https://api.iconify.design/${iconName}.svg`;
    }
    const ext = fileName.split(".").pop()?.toLowerCase();
    const iconName = ICONS[ext] || ICONS.default;
    return `https://api.iconify.design/${iconName}.svg`;
}

function clearSelection() {
    document.querySelectorAll('.tree-item.selected').forEach(el => {
        el.classList.remove('selected');
    });
    selectedItem = null;
}

function selectItem(element, path, isFile = true) {
    clearSelection();
    element.classList.add('selected');
    selectedItem = { element, path, isFile };
    if (isFile) {
        currentPath = path;
    }
}

function createTreeItem(item, fullPath, depth = 0) {
    const itemDiv = document.createElement('div');
    const isExpanded = expandedDirs.has(fullPath);

    const treeItem = document.createElement('div');
    treeItem.className = 'tree-item';
    treeItem.style.paddingLeft = `${8 + depth * 16}px`;

    // Arrow for folders
    const arrow = document.createElement('div');
    arrow.className = `tree-arrow ${item.type === 'folder' ? (isExpanded ? 'expanded' : '') : 'hidden'}`;
    arrow.textContent = item.type === 'folder' ? '▶' : '';

    // Icon
    const icon = document.createElement('img');
    icon.className = 'tree-icon';
    icon.src = getIconURL(item.name, item.type === 'folder', isExpanded);
    icon.width = 16;
    icon.height = 16;
    icon.style.objectFit = 'contain';

    // Label
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = item.name;

    treeItem.appendChild(arrow);
    treeItem.appendChild(icon);
    treeItem.appendChild(label);

    // Click handlers
    if (item.type === 'folder') {
        treeItem.addEventListener('click', (e) => {
            e.stopPropagation();
            selectItem(treeItem, fullPath, false);

            // Toggle expand/collapse
            if (expandedDirs.has(fullPath)) {
                expandedDirs.delete(fullPath);
                arrow.classList.remove('expanded');
                icon.src = getIconURL(item.name, true, false);
                const children = itemDiv.querySelector('.tree-children');
                if (children) children.remove();
            } else {
                expandedDirs.add(fullPath);
                arrow.classList.add('expanded');
                icon.src = getIconURL(item.name, true, true);
                loadTreeChildren(itemDiv, fullPath, depth + 1);
            }
        });

        // Double click to enter folder in flat view
        treeItem.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            switchToFlatView();
            currentDir = fullPath;
            loadFlatFolder(fullPath);
        });
    } else {
        // File click
        treeItem.addEventListener('click', (e) => {
            e.stopPropagation();
            selectItem(treeItem, fullPath, true);
            openFile(fullPath);
        });
    }

    itemDiv.appendChild(treeItem);

    // Load children if expanded
    if (item.type === 'folder' && isExpanded) {
        loadTreeChildren(itemDiv, fullPath, depth + 1);
    }

    return itemDiv;
}

function loadTreeChildren(parentDiv, dirPath, depth) {
    fetch(`/api/list?dir=${dirPath}`)
        .then(res => res.json())
        .then(data => {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'tree-children';

            data.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'folder' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            data.forEach(item => {
                const childPath = dirPath ? `${dirPath}/${item.name}` : item.name;
                const childItem = createTreeItem(item, childPath, depth);
                childrenDiv.appendChild(childItem);
            });

            parentDiv.appendChild(childrenDiv);
        })
        .catch(err => console.error('Failed to load children:', err));
}

function loadFileTree() {
    if (viewMode !== 'tree') return;

    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    fetch('/api/list?dir=')
        .then(res => res.json())
        .then(data => {
            data.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'folder' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            data.forEach(item => {
                const itemElement = createTreeItem(item, item.name, 0);
                fileList.appendChild(itemElement);
            });
        })
        .catch(err => console.error('Failed to load tree:', err));
}

function loadFlatFolder(dir = "") {
    if (viewMode !== 'flat') return;

    fetch(`/api/list?dir=${dir}`)
        .then(res => res.json())
        .then(data => {
            const list = document.getElementById("fileList");
            list.innerHTML = "";

            // Back button
            if (dir) {
                const backBtn = document.createElement("div");
                backBtn.className = "back-button";
                backBtn.innerHTML = '<span style="margin-right: 8px;">←</span>Back';
                backBtn.onclick = () => {
                    const parts = dir.split("/").filter(Boolean);
                    parts.pop();
                    currentDir = parts.join("/");
                    loadFlatFolder(currentDir);
                };
                list.appendChild(backBtn);
            }

            data.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'folder' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            data.forEach(item => {
                const fullPath = dir ? `${dir}/${item.name}` : item.name;
                const row = document.createElement("div");
                row.className = "tree-item";

                const icon = document.createElement("img");
                icon.className = "tree-icon";
                icon.src = getIconURL(item.name, item.type === 'folder');
                icon.width = 16;
                icon.height = 16;
                icon.style.objectFit = 'contain';

                const label = document.createElement("span");
                label.className = "tree-label";
                label.textContent = item.name;

                row.appendChild(icon);
                row.appendChild(label);
                list.appendChild(row);

                if (item.type === "folder") {
                    row.onclick = () => {
                        selectItem(row, fullPath, false);
                    };
                    row.ondblclick = () => {
                        currentDir = fullPath;
                        loadFlatFolder(fullPath);
                    };
                } else {
                    row.onclick = () => {
                        selectItem(row, fullPath, true);
                        openFile(fullPath);
                    };
                }
            });
        })
        .catch(err => console.error('Failed to load folder:', err));
}

function switchToTreeView() {
    viewMode = 'tree';
    document.getElementById('treeView').classList.add('active');
    document.getElementById('flatView').classList.remove('active');
    clearSelection();
    loadFileTree();
}

function switchToFlatView() {
    viewMode = 'flat';
    document.getElementById('flatView').classList.add('active');
    document.getElementById('treeView').classList.remove('active');
    clearSelection();
    loadFlatFolder(currentDir);
}


function getLanguageFromPath(path) {
    const ext = path.split('.').pop().toLowerCase();
    const map = {
        py: 'python',
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        html: 'html',
        css: 'css',
        json: 'json',
        md: 'markdown',
        cpp: 'cpp',
        c: 'c',
        java: 'java',
        php: 'php',
        go: 'go',
        rs: 'rust',
        rb: 'ruby',
        xml: 'xml',
        yaml: 'yaml',
        yml: 'yaml',
        sh: 'shell',
        txt: 'plaintext'
    };
    return map[ext] || 'plaintext';
}

function openFile(path) {
    if (openFiles[path]) {
        window.editor.setModel(openFiles[path].model);
        highlightTab(path);
        currentPath = path;
        return;
    }

    fetch(`/api/read?path=${path}`)
        .then(res => res.text())
        .then(content => {
            const ext = path.split('.').pop();
            const lang = getLanguageFromPath(ext);
            const model = monaco.editor.createModel(content, lang);
            window.editor.setModel(model);
            currentPath = path;

            // Create new tab
            const tab = createEditorTab(path);
            openFiles[path] = { model, tabElement: tab };

            highlightTab(path);
        })
        .catch(err => {
            console.error('Failed to open file:', err);
            alert('Failed to open file: ' + err.message);
        });
}

// function openFile(path) {
//     fetch(`/api/read?path=${path}`)
//         .then(res => res.text())
//         .then(content => {
//             if (window.editor) {
//                 const ext = path.split('.').pop();
//                 const lang = getLanguageFromPath(ext);

//                 const oldModel = window.editor.getModel();
//                 const newModel = monaco.editor.createModel(content, lang);
//                 window.editor.setModel(newModel);

//                 if (oldModel) oldModel.dispose(); // cleanup

//                 document.getElementById("filename").textContent = path;
//                 currentPath = path;
//             }
//         })
//         .catch(err => {
//             console.error('Failed to open file:', err);
//             alert('Failed to open file: ' + err.message);
//         });
// }


function autoSave() {
    if (!currentPath || !window.editor) return;
    const content = window.editor.getValue();
    fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, content }),
    }).catch(err => console.error('Auto-save failed:', err));
}

function createEntry() {
    const name = document.getElementById("newPath").value.trim();
    const type = document.getElementById("newType").value;
    if (!name) return alert("Please enter a name");

    const fullPath = currentDir ? `${currentDir}/${name}` : name;

    fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, type })
    })
        .then(res => {
            if (!res.ok) {
                return res.text().then(text => {
                    throw new Error(text);
                });
            }
            // Refresh current view
            if (viewMode === 'tree') {
                loadFileTree();
            } else {
                loadFlatFolder(currentDir);
            }
            document.getElementById("newPath").value = "";
        })
        .catch(err => {
            console.error('Failed to create entry:', err);
            alert('Failed to create entry: ' + err.message);
        });
}

function deleteSelected() {
    if (!selectedItem) return alert("Select a file or folder first");

    const path = selectedItem.path;
    if (!confirm(`Are you sure you want to delete "${path}"?`)) return;

    fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
    })
        .then(res => {
            if (!res.ok) {
                return res.text().then(text => {
                    throw new Error(text);
                });
            }

            // Clear editor if deleted file was open
            if (currentPath === path) {
                if (window.editor) {
                    window.editor.setValue("");
                }
                document.getElementById("filename").textContent = "No file selected";
                currentPath = "";
            }

            // Refresh current view
            if (viewMode === 'tree') {
                loadFileTree();
            } else {
                loadFlatFolder(currentDir);
            }

            clearSelection();
        })
        .catch(err => {
            console.error('Failed to delete:', err);
            alert('Failed to delete: ' + err.message);
        });
}

// Terminal Functions
function initializeTerminal() {
    socket = io();

    socket.on('connect', function () {
        console.log('Connected to server');
        isTerminalConnected = true;
        socket.emit('start_terminal', { working_dir: currentDir || '' });
    });

    socket.on('disconnect', function () {
        console.log('Disconnected from server');
        isTerminalConnected = false;
    });

    socket.on('terminal_ready', function (data) {
        appendToTerminal('Terminal ready.\n', 'success');
    });

    socket.on('terminal_output', function (data) {
        appendToTerminal(data.data);
    });

    socket.on('terminal_error', function (data) {
        appendToTerminal(`Error: ${data.message}\n`, 'error');
    });

    // Terminal input handling
    const terminalInput = document.getElementById('terminal-input');
    terminalInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            const command = terminalInput.value;
            if (command.trim()) {
                terminalHistory.push(command);
                historyIndex = terminalHistory.length;

                if (socket && isTerminalConnected) {
                    socket.emit('terminal_input', { data: command + '\n' });
                }
                terminalInput.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                terminalInput.value = terminalHistory[historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < terminalHistory.length - 1) {
                historyIndex++;
                terminalInput.value = terminalHistory[historyIndex];
            } else {
                historyIndex = terminalHistory.length;
                terminalInput.value = '';
            }
        }
    });

    // Terminal copy/paste functionality
    const terminalOutput = document.getElementById('terminal-output');
    terminalOutput.style.userSelect = 'text';
    terminalOutput.style.webkitUserSelect = 'text';  // for Safari


    // Enable text selection
    terminalOutput.style.userSelect = 'text';
    terminalOutput.style.webkitUserSelect = 'text';

    // Copy selected text on Ctrl+C
    terminalOutput.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.key === 'c') {
            const selection = window.getSelection();
            if (selection.toString().length > 0) {
                navigator.clipboard.writeText(selection.toString());
                e.preventDefault();
            }
        }
    });

    // Right-click context menu for paste
    terminalOutput.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showTerminalContextMenu(e);
    });

    terminalInput.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showTerminalContextMenu(e);
    });
}

function showTerminalContextMenu(e) {
    // Remove existing context menu
    const existingMenu = document.querySelector('.terminal-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'terminal-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.background = '#2d2d30';
    menu.style.border = '1px solid #464647';
    menu.style.borderRadius = '3px';
    menu.style.padding = '4px 0';
    menu.style.zIndex = '9999';
    menu.style.minWidth = '120px';

    const copyOption = document.createElement('div');
    copyOption.textContent = 'Copy';
    copyOption.style.padding = '8px 16px';
    copyOption.style.cursor = 'pointer';
    copyOption.style.fontSize = '13px';
    copyOption.style.color = '#cccccc';
    copyOption.addEventListener('mouseover', function () {
        copyOption.style.background = '#094771';
    });
    copyOption.addEventListener('mouseout', function () {
        copyOption.style.background = 'transparent';
    });
    copyOption.addEventListener('click', function () {
        const selection = window.getSelection();
        if (selection.toString().length > 0) {
            navigator.clipboard.writeText(selection.toString());
        }
        menu.remove();
    });

    const pasteOption = document.createElement('div');
    pasteOption.textContent = 'Paste';
    pasteOption.style.padding = '8px 16px';
    pasteOption.style.cursor = 'pointer';
    pasteOption.style.fontSize = '13px';
    pasteOption.style.color = '#cccccc';
    pasteOption.addEventListener('mouseover', function () {
        pasteOption.style.background = '#094771';
    });
    pasteOption.addEventListener('mouseout', function () {
        pasteOption.style.background = 'transparent';
    });
    pasteOption.addEventListener('click', async function () {
        try {
            const text = await navigator.clipboard.readText();
            if (socket && isTerminalConnected) {
                socket.emit('terminal_input', { data: text });
            }
        } catch (err) {
            console.error('Failed to paste:', err);
        }
        menu.remove();
    });

    menu.appendChild(copyOption);
    menu.appendChild(pasteOption);
    document.body.appendChild(menu);

    // Remove menu on click outside
    setTimeout(() => {
        document.addEventListener('click', function removeMenu() {
            if (document.body.contains(menu)) {
                menu.remove();
            }
            document.removeEventListener('click', removeMenu);
        });
    }, 0);
}
function appendToTerminal(text, type = 'normal') {
    const terminalOutput = document.getElementById('terminal-output');

    const ansi_up = new AnsiUp();
    ansi_up.use_classes = false; // Use inline styles for working colors

    const html = ansi_up.ansi_to_html(text);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    // Add additional styling if it's an error or success message
    if (type === 'error') {
        wrapper.style.color = '#f48771';
    } else if (type === 'success') {
        wrapper.style.color = '#89d185';
    }

    terminalOutput.appendChild(wrapper);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function clearTerminal() {
    document.getElementById('terminal-output').innerHTML = '';
}

function restartTerminal() {
    if (socket && isTerminalConnected) {
        clearTerminal();
        socket.emit('start_terminal', { working_dir: currentDir || '' });
    }
}

// Resize handle functionality
function initializeResize() {
    const resizeHandle = document.getElementById('resizeHandle');
    const terminal = document.getElementById('terminal');
    const editorContainer = document.querySelector('.editor-terminal-container');
    let isResizing = false;

    resizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
    });

    function handleResize(e) {
        if (!isResizing) return;

        const containerRect = document.getElementById('editor').getBoundingClientRect();
        const mouseY = e.clientY;
        const containerBottom = containerRect.bottom;
        const newTerminalHeight = Math.max(100, Math.min(400, containerBottom - mouseY));

        terminal.style.height = newTerminalHeight + 'px';

        // Update Monaco editor layout
        if (window.editor) {
            setTimeout(() => window.editor.layout(), 0);
        }
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }
}
require.config({
    paths: {
        vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs"
    }
});
require(["vs/editor/editor.main"], function () {
    monaco.editor.defineTheme('one-dark-pro', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'C586C0' },
            { token: 'number', foreground: 'B5CEA8' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'variable', foreground: '9CDCFE' },
            { token: 'type', foreground: '4EC9B0' },
            { token: 'function', foreground: 'DCDCAA' },
        ],
        colors: {
            'editor.background': '#1E1E1E',
            'editor.foreground': '#D4D4D4',
            'editorLineNumber.foreground': '#858585',
            'editorCursor.foreground': '#AEAFAD',
            'editor.lineHighlightBackground': '#2B2B2B',
            'editor.selectionBackground': '#264F78',
            'editor.inactiveSelectionBackground': '#3A3D41'
        }
    });

    window.editor = monaco.editor.create(document.getElementById("monaco"), {
        value: "",
        language: "python",
        theme: "one-dark-pro", // Use the custom theme here
        automaticLayout: true,
        fontSize: 15,
        lineNumbers: "on",
        roundedSelection: false,
        scrollBeyondLastLine: false,
        readOnly: false,
        minimap: { enabled: true }
    });

    window.editor.focus();

    window.editor.onDidChangeModelContent(() => {
        clearTimeout(window._autosave);
        window._autosave = setTimeout(autoSave, 1000);
    });

    // Load initial file tree
    loadFileTree();
});


document.addEventListener('DOMContentLoaded', function () {
    initializeTerminal();
    initializeResize();
    addTerminalTab();
});


// Handle Enter key in create input
document.getElementById('newPath').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        createEntry();
    }
});

// Terminal resize functionality
let isResizing = false;
let startY = 0;
let startHeight = 0;

document.addEventListener('DOMContentLoaded', function () {
    const resizeHandle = document.getElementById('resizeHandle');
    const terminal = document.getElementById('terminal');
    const editorTerminalContainer = document.querySelector('.editor-terminal-container');

    if (!resizeHandle || !terminal) {
        console.error('Resize handle or terminal not found');
        return;
    }

    // Mouse down on resize handle
    resizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        startY = e.clientY;
        startHeight = parseInt(document.defaultView.getComputedStyle(terminal).height, 10);

        // Prevent text selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'row-resize';

        e.preventDefault();
    });

    // Mouse move - handle resizing
    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;

        const deltaY = startY - e.clientY; // Inverted because we want dragging up to increase height
        const newHeight = startHeight + deltaY;

        // Set min and max heights
        const minHeight = 80;
        const maxHeight = window.innerHeight * 0.8; // 80% of viewport height

        // Constrain the height
        const constrainedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

        // Apply the new height
        terminal.style.height = constrainedHeight + 'px';

        e.preventDefault();
    });

    // Mouse up - stop resizing
    document.addEventListener('mouseup', function () {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });

    // Handle window resize to maintain proper constraints
    window.addEventListener('resize', function () {
        const currentHeight = parseInt(document.defaultView.getComputedStyle(terminal).height, 10);
        const maxHeight = window.innerHeight * 0.8;

        if (currentHeight > maxHeight) {
            terminal.style.height = maxHeight + 'px';
        }
    });

    // Double-click on resize handle to reset to default height
    resizeHandle.addEventListener('dblclick', function () {
        terminal.style.height = '300px';
    });
});

// Alternative touch support for mobile devices
document.addEventListener('DOMContentLoaded', function () {
    const resizeHandle = document.getElementById('resizeHandle');
    const terminal = document.getElementById('terminal');

    if (!resizeHandle || !terminal) return;

    let touchStartY = 0;
    let touchStartHeight = 0;

    resizeHandle.addEventListener('touchstart', function (e) {
        touchStartY = e.touches[0].clientY;
        touchStartHeight = parseInt(document.defaultView.getComputedStyle(terminal).height, 10);
        e.preventDefault();
    });

    resizeHandle.addEventListener('touchmove', function (e) {
        const touchY = e.touches[0].clientY;
        const deltaY = touchStartY - touchY;
        const newHeight = touchStartHeight + deltaY;

        const minHeight = 80;
        const maxHeight = window.innerHeight * 0.8;
        const constrainedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

        terminal.style.height = constrainedHeight + 'px';
        e.preventDefault();
    });
});


//  $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
async function runGeminiCompletion() {
    if (!window.editor) return alert("Editor not ready");

    const model = window.editor.getModel();
    const position = window.editor.getPosition();
    const totalLines = model.getLineCount();
    const prevLines = parseInt(document.getElementById("prevLines").value) || 5;
    const nextLines = parseInt(document.getElementById("nextLines").value) || 2;

    const startLine = Math.max(1, position.lineNumber - prevLines);
    const endLine = Math.min(totalLines, position.lineNumber);

    // Extract 2 lines above and 2 lines below the cursor
    let contextLines = [];
    for (let i = startLine; i <= endLine; i++) {
        contextLines.push(model.getLineContent(i));
    }
    const prompt = contextLines.join('\n');

    try {
        const res = await fetch("/api/autocomplete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, nextLines }),
        });

        const data = await res.json();
        if (!data || !data.completion) return alert("No response from Gemini.");

        let completion = data.completion;
        console.log(completion)
        const match = completion.match(/```(?:[a-zA-Z]*)?([\s\S]*?)```/);
        if (match) {
            completion = match[1];
        }

        window.editor.executeEdits("gemini", [
            {
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: completion,
                forceMoveMarkers: true
            }
        ]);
        window.editor.focus();
    } catch (err) {
        console.error("Gemini request failed:", err);
        alert("Autocomplete failed: " + err.message);
    }
}

document.addEventListener("keydown", (event) => {
    if (event.shiftKey && event.altKey && !event.ctrlKey && !event.metaKey) {
        console.log("AI CALLED")
        event.preventDefault();
        runGeminiCompletion();
    }
});
// ###########################################################3



document.addEventListener('contextmenu', function (e) {
    const target = e.target.closest('.tree-item');
    if (target && document.getElementById('fileList').contains(target)) {
        e.preventDefault();
        showFileContextMenu(e, target);
    }
});


let clipboardItem = null; // to support copy/paste

function showFileContextMenu(e, target) {
    const path = target.querySelector('.tree-label').textContent;
    const fullPath = selectedItem?.path || path;

    // Clear any existing menu
    document.querySelector('.file-context-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'file-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.background = '#2d2d30';
    menu.style.border = '1px solid #444';
    menu.style.borderRadius = '4px';
    menu.style.zIndex = '9999';
    menu.style.minWidth = '160px';
    menu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.4)';

    const options = [
        { label: '<span class="codicon codicon-copy"></span> Copy', action: () => { clipboardItem = fullPath; } },
        { label: '<span class="codicon codicon-clippy"></span> Paste', action: () => { if (clipboardItem) pasteItem(clipboardItem, fullPath); } },
        { label: '<span class="codicon codicon-cloud-upload"></span> Upload File', action: () => triggerFileUpload(fullPath) },
        { label: '<span class="codicon codicon-cloud-download"></span> Download', action: () => downloadFile(fullPath) },
        { label: '<span class="codicon codicon-link"></span> Copy Path', action: () => navigator.clipboard.writeText(fullPath) },
        // { label: '<span class="codicon codicon-symbol-key"></span> Copy Relative Path', action: () => navigator.clipboard.writeText(getRelativePath(fullPath)) },
        { label: '<span class="codicon codicon-edit"></span> Rename', action: () => renameItem(fullPath, target) },
        { label: '<span class="codicon codicon-trash"></span> Delete', action: () => deleteSelected() }
    ];


    options.forEach(opt => {
        const div = document.createElement('div');
        // div.textContent = opt.label;
        div.innerHTML = opt.label;
        div.style.padding = '8px 12px';
        div.style.cursor = 'pointer';
        div.style.fontSize = '13px';
        div.style.color = '#ccc';
        div.addEventListener('mouseover', () => div.style.background = '#094771');
        div.addEventListener('mouseout', () => div.style.background = 'transparent');
        div.addEventListener('click', () => {
            opt.action();
            menu.remove();
        });
        menu.appendChild(div);
    });

    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', function removeMenu() {
            if (document.body.contains(menu)) menu.remove();
            document.removeEventListener('click', removeMenu);
        });
    }, 0);
}

function pasteItem(srcPath, destDir) {
    fetch("/api/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: srcPath, destination: destDir })
    })
        .then(res => res.ok ? (viewMode === 'tree' ? loadFileTree() : loadFlatFolder(currentDir)) : Promise.reject(res))
        .catch(err => alert("Paste failed: " + err.message));
}

function triggerFileUpload(destinationDir) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
        const file = input.files[0];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("destination", destinationDir);

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        }).then(() => {
            viewMode === 'tree' ? loadFileTree() : loadFlatFolder(currentDir);
        }).catch(err => alert("Upload failed: " + err.message));
    };
    input.click();
}

function downloadFile(path) {
    const a = document.createElement('a');
    a.href = `/api/download?path=${encodeURIComponent(path)}`;
    a.download = path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function renameItem(path, element) {
    const newName = prompt("Enter new name:", path.split('/').pop());
    if (!newName) return;

    fetch('/api/rename', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: path, newName })
    }).then(res => {
        if (res.ok) {
            viewMode === 'tree' ? loadFileTree() : loadFlatFolder(currentDir);
        } else {
            res.text().then(text => alert("Rename failed: " + text));
        }
    }).catch(err => alert("Rename failed: " + err.message));
}

function getRelativePath(fullPath) {
    return fullPath.replace(/^.*?\/?/, ''); // Adjust based on project root logic
}
















// document.getElementById('runButton').addEventListener('click', () => {
//     if (!window.editor || !currentPath) return alert("No file open");

//     if (terminals.length === 0) {
//         addTerminalTab();
//     }

//     const filePath = currentPath;
//     const ext = filePath.split('.').pop().toLowerCase();

//     const runCommands = {
//         'py': `python3 "${filePath}"`,
//         'js': `node "${filePath}"`,
//         'sh': `bash "${filePath}"`,
//         'cpp': `g++ "${filePath}" -o out && ./out`,
//         'c': `gcc "${filePath}" -o out && ./out`,
//         'java': `javac "${filePath}" && java ${filePath.replace(/\.java$/, '')}`,
//         'rb': `ruby "${filePath}"`,
//         'go': `go run "${filePath}"`,
//     };

//     const command = runCommands[ext];
//     if (!command) {
//         return alert(`No run command defined for .${ext} files`);
//     }

//     autoSave();

//     // Use active terminal and send command
//     const activeTerminal = terminals[activeTerminalIdx];
//     if (activeTerminal && activeTerminal.socket && activeTerminal.socket.connected) {
//         activeTerminal.socket.emit('terminal_input', { data: command + '\n' });
//         activeTerminal.input.focus();
//     } 
// });


addTerminalTab();
document.getElementById('runButton').addEventListener('click', () => {
    if (!window.editor || !currentPath) return alert("No file open");

    if (terminals.length === 0) {
        addTerminalTab();
    }

    const filePath = currentPath;
    const ext = filePath.split('.').pop().toLowerCase();

    const runCommands = {
        // Use -u flag for Python to ensure unbuffered output
        'py': `python3 -u "${filePath}"`,
        'js': `node "${filePath}"`,
        'sh': `bash "${filePath}"`,
        'cpp': `g++ "${filePath}" -o out && ./out`,
        'c': `gcc "${filePath}" -o out && ./out`,
        'java': `javac "${filePath}" && java ${filePath.replace(/\.java$/, '')}`,
        'rb': `ruby "${filePath}"`,
        'go': `go run "${filePath}"`,
    };

    const command = runCommands[ext];
    if (!command) {
        return alert(`No run command defined for .${ext} files`);
    }

    autoSave();

    const activeTerminal = terminals[activeTerminalIdx];

    if (activeTerminal.socket.connected) {
        activeTerminal.input.focus();
        activeTerminal.input.value = command;
        activeTerminal.input.focus();
    }
});



function setupTerminalInputHandler(input, terminalIndex, socket, history) {
    let historyIndex = history.length;
    let currentLine = '';
    let cursorPosition = 0;
    let searchMode = false;
    let searchQuery = '';
    let originalCommand = '';

    input.addEventListener('keydown', function (e) {
        const activeTerminal = terminals[terminalIndex];

        // Handle different key combinations
        if (e.ctrlKey) {
            switch (e.key) {
                case 'c':
                    e.preventDefault();
                    // Send SIGINT (Ctrl+C)
                    socket.emit('terminal_input', { data: '\x03' });
                    input.value = '';
                    cursorPosition = 0;
                    break;

                case 'd':
                    e.preventDefault();
                    // Send EOF (Ctrl+D)
                    if (input.value === '') {
                        socket.emit('terminal_input', { data: '\x04' });
                    } else {
                        // Delete character at cursor
                        const value = input.value;
                        input.value = value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
                    }
                    break;

                case 'z':
                    e.preventDefault();
                    // Send SIGTSTP (Ctrl+Z)
                    socket.emit('terminal_input', { data: '\x1a' });
                    break;

                case 'l':
                    e.preventDefault();
                    // Clear screen
                    socket.emit('terminal_input', { data: 'clear\n' });
                    break;

                case 'a':
                    e.preventDefault();
                    // Move cursor to beginning of line
                    input.setSelectionRange(0, 0);
                    cursorPosition = 0;
                    break;

                case 'e':
                    e.preventDefault();
                    // Move cursor to end of line
                    cursorPosition = input.value.length;
                    input.setSelectionRange(cursorPosition, cursorPosition);
                    break;

                case 'k':
                    e.preventDefault();
                    // Kill line from cursor to end
                    const pos = input.selectionStart;
                    input.value = input.value.substring(0, pos);
                    cursorPosition = pos;
                    break;

                case 'u':
                    e.preventDefault();
                    // Kill line from beginning to cursor
                    const curPos = input.selectionStart;
                    input.value = input.value.substring(curPos);
                    input.setSelectionRange(0, 0);
                    cursorPosition = 0;
                    break;

                case 'w':
                    e.preventDefault();
                    // Delete word backwards
                    const startPos = input.selectionStart;
                    const value = input.value;
                    let wordStart = startPos - 1;

                    // Skip whitespace
                    while (wordStart >= 0 && /\s/.test(value[wordStart])) {
                        wordStart--;
                    }
                    // Find start of word
                    while (wordStart >= 0 && !/\s/.test(value[wordStart])) {
                        wordStart--;
                    }
                    wordStart++;

                    input.value = value.slice(0, wordStart) + value.slice(startPos);
                    input.setSelectionRange(wordStart, wordStart);
                    cursorPosition = wordStart;
                    break;

                case 'r':
                    e.preventDefault();
                    // Reverse search
                    if (!searchMode) {
                        searchMode = true;
                        originalCommand = input.value;
                        searchQuery = '';
                        input.placeholder = "(reverse-i-search)`': ";
                    }
                    break;

                case 'g':
                    e.preventDefault();
                    // Cancel search or command
                    if (searchMode) {
                        searchMode = false;
                        input.value = originalCommand;
                        input.placeholder = "Type command and press Enter...";
                    } else {
                        input.value = '';
                        cursorPosition = 0;
                    }
                    break;

                case 'p':
                    e.preventDefault();
                    // Previous command (alternative to up arrow)
                    if (historyIndex > 0) {
                        historyIndex--;
                        input.value = history[historyIndex];
                        cursorPosition = input.value.length;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                    break;

                case 'n':
                    e.preventDefault();
                    // Next command (alternative to down arrow)
                    if (historyIndex < history.length - 1) {
                        historyIndex++;
                        input.value = history[historyIndex];
                    } else {
                        historyIndex = history.length;
                        input.value = '';
                    }
                    cursorPosition = input.value.length;
                    input.setSelectionRange(cursorPosition, cursorPosition);
                    break;

                case 'f':
                    e.preventDefault();
                    // Move cursor forward one character
                    if (cursorPosition < input.value.length) {
                        cursorPosition++;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                    break;

                case 'b':
                    e.preventDefault();
                    // Move cursor backward one character
                    if (cursorPosition > 0) {
                        cursorPosition--;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                    break;

                case 'h':
                    e.preventDefault();
                    // Backspace (delete char before cursor)
                    if (cursorPosition > 0) {
                        const value = input.value;
                        input.value = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
                        cursorPosition--;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                    break;
            }
        }
        // Alt key combinations
        else if (e.altKey) {
            switch (e.key) {
                case 'f':
                    e.preventDefault();
                    // Move forward one word
                    const value = input.value;
                    let pos = input.selectionStart;

                    // Skip current word
                    while (pos < value.length && !/\s/.test(value[pos])) {
                        pos++;
                    }
                    // Skip whitespace
                    while (pos < value.length && /\s/.test(value[pos])) {
                        pos++;
                    }

                    input.setSelectionRange(pos, pos);
                    cursorPosition = pos;
                    break;

                case 'b':
                    e.preventDefault();
                    // Move backward one word
                    const val = input.value;
                    let position = input.selectionStart - 1;

                    // Skip whitespace
                    while (position >= 0 && /\s/.test(val[position])) {
                        position--;
                    }
                    // Find start of word
                    while (position >= 0 && !/\s/.test(val[position])) {
                        position--;
                    }
                    position++;

                    input.setSelectionRange(position, position);
                    cursorPosition = position;
                    break;

                case 'd':
                    e.preventDefault();
                    // Delete word forward
                    const currentValue = input.value;
                    const startPosition = input.selectionStart;
                    let endPos = startPosition;

                    // Skip current word
                    while (endPos < currentValue.length && !/\s/.test(currentValue[endPos])) {
                        endPos++;
                    }
                    // Skip whitespace
                    while (endPos < currentValue.length && /\s/.test(currentValue[endPos])) {
                        endPos++;
                    }

                    input.value = currentValue.slice(0, startPosition) + currentValue.slice(endPos);
                    input.setSelectionRange(startPosition, startPosition);
                    cursorPosition = startPosition;
                    break;

                case 'Backspace':
                    e.preventDefault();
                    // Delete word backward (same as Ctrl+W)
                    const startPos = input.selectionStart;
                    const inputValue = input.value;
                    let wordStart = startPos - 1;

                    while (wordStart >= 0 && /\s/.test(inputValue[wordStart])) {
                        wordStart--;
                    }
                    while (wordStart >= 0 && !/\s/.test(inputValue[wordStart])) {
                        wordStart--;
                    }
                    wordStart++;

                    input.value = inputValue.slice(0, wordStart) + inputValue.slice(startPos);
                    input.setSelectionRange(wordStart, wordStart);
                    cursorPosition = wordStart;
                    break;
            }
        }
        // Regular keys without modifiers
        else {
            switch (e.key) {
                case 'Enter':
                    e.preventDefault();
                    const command = input.value.trim();

                    if (searchMode) {
                        // Execute found command
                        searchMode = false;
                        input.placeholder = "Type command and press Enter...";
                    }

                    if (command) {
                        // Add to history if it's not a duplicate of the last command
                        if (history.length === 0 || history[history.length - 1] !== command) {
                            history.push(command);
                            // Limit history size
                            if (history.length > 1000) {
                                history.shift();
                            }
                        }
                        historyIndex = history.length;

                        // Handle special commands
                        if (command === 'clear' || command === 'cls') {
                            activeTerminal.output.innerHTML = '';
                        }

                        socket.emit('terminal_input', { data: command + '\n' });
                        input.value = '';
                        cursorPosition = 0;
                    } else {
                        // Empty command, just send newline
                        socket.emit('terminal_input', { data: '\n' });
                    }
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    if (searchMode) {
                        // Continue reverse search
                        searchInHistory(true);
                    } else if (historyIndex > 0) {
                        historyIndex--;
                        input.value = history[historyIndex];
                        cursorPosition = input.value.length;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    if (searchMode) {
                        // Forward search
                        searchInHistory(false);
                    } else if (historyIndex < history.length - 1) {
                        historyIndex++;
                        input.value = history[historyIndex];
                        cursorPosition = input.value.length;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    } else {
                        historyIndex = history.length;
                        input.value = '';
                        cursorPosition = 0;
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    if (cursorPosition > 0) {
                        cursorPosition--;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    if (cursorPosition < input.value.length) {
                        cursorPosition++;
                        input.setSelectionRange(cursorPosition, cursorPosition);
                    }
                    break;

                case 'Home':
                    e.preventDefault();
                    cursorPosition = 0;
                    input.setSelectionRange(0, 0);
                    break;

                case 'End':
                    e.preventDefault();
                    cursorPosition = input.value.length;
                    input.setSelectionRange(cursorPosition, cursorPosition);
                    break;

                case 'Delete':
                    e.preventDefault();
                    if (cursorPosition < input.value.length) {
                        const value = input.value;
                        input.value = value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
                    }
                    break;

                case 'Backspace':
                    if (!searchMode) {
                        // Let default backspace behavior work
                        setTimeout(() => {
                            cursorPosition = input.selectionStart;
                        }, 0);
                    } else {
                        e.preventDefault();
                        if (searchQuery.length > 0) {
                            searchQuery = searchQuery.slice(0, -1);
                            searchInHistory(true);
                        }
                    }
                    break;

                case 'Tab':
                    e.preventDefault();
                    // Basic tab completion (you can enhance this)
                    handleTabCompletion(input, socket);
                    break;

                case 'Escape':
                    e.preventDefault();
                    if (searchMode) {
                        searchMode = false;
                        input.value = originalCommand;
                        input.placeholder = "Type command and press Enter...";
                    } else {
                        // Clear current line
                        input.value = '';
                        cursorPosition = 0;
                    }
                    break;

                default:
                    if (searchMode && e.key.length === 1) {
                        e.preventDefault();
                        searchQuery += e.key;
                        searchInHistory(true);
                    } else if (!e.ctrlKey && !e.altKey && e.key.length === 1) {
                        // Regular character input
                        setTimeout(() => {
                            cursorPosition = input.selectionStart;
                        }, 0);
                    }
                    break;
            }
        }
    });

    // Helper function for history search
    function searchInHistory(reverse = true) {
        const matches = history.filter(cmd => cmd.includes(searchQuery));
        if (matches.length > 0) {
            const match = reverse ? matches[matches.length - 1] : matches[0];
            input.value = match;
            input.placeholder = `(reverse-i-search)\`${searchQuery}': ${match}`;
        }
    }

    // Basic tab completion
    function handleTabCompletion(input, socket) {
        const currentValue = input.value;
        const words = currentValue.split(' ');
        const lastWord = words[words.length - 1];

        if (words.length === 1) {
            // Command completion
            const commonCommands = [
                'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'cat', 'less', 'more',
                'grep', 'find', 'which', 'whereis', 'man', 'info', 'help', 'history',
                'ps', 'top', 'kill', 'killall', 'jobs', 'bg', 'fg', 'nohup',
                'chmod', 'chown', 'chgrp', 'umask', 'sudo', 'su',
                'git', 'npm', 'node', 'python', 'python3', 'pip', 'pip3',
                'vim', 'nano', 'emacs', 'code', 'clear', 'exit', 'logout'
            ];

            const matches = commonCommands.filter(cmd => cmd.startsWith(lastWord));
            if (matches.length === 1) {
                words[words.length - 1] = matches[0];
                input.value = words.join(' ') + ' ';
                cursorPosition = input.value.length;
            } else if (matches.length > 1) {
                // Show possible completions in terminal
                appendToTerminalTab(terminalIndex, '\n' + matches.join('  ') + '\n');
            }
        } else {
            // File completion - send to server for actual file system completion
            socket.emit('tab_completion', {
                command: currentValue,
                cursor_position: input.selectionStart
            });
        }
    }

    // Update cursor position on clicks
    input.addEventListener('click', function () {
        setTimeout(() => {
            cursorPosition = input.selectionStart;
        }, 0);
    });

    // Update history index reference
    activeTerminal.historyIndex = historyIndex;
}

const keySequence = [];
let sequenceTimer = null;

// Max delay allowed between key presses in ms
const sequenceTimeout = 600;

// Listen globally or on terminal input
document.addEventListener('keydown', function (e) {
    const key = e.key.toLowerCase();

    if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        if (socket && isTerminalConnected) {
            socket.emit('terminal_input', { data: '\x03' }); // ASCII 3 = Ctrl+C
        }
        return;
    }

    // Ctrl + L => Clear screen
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        clearTerminal();
        return;
    }

    // Ctrl + A => Move cursor to start
    if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        input.setSelectionRange(0, 0);
        return;
    }

    // Ctrl + E => Move cursor to end
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        const len = input.value.length;
        input.setSelectionRange(len, len);
        return;
    }

    // Ctrl + U => Clear entire line
    if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        input.value = '';
        return;
    }

    // Ctrl + K => Clear from cursor to end
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        const cursor = input.selectionStart;
        input.value = input.value.slice(0, cursor);
        return;
    }

    // Ctrl + D => Simulate detach or exit
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        socket.emit('terminal_input', { data: '\x04' }); // ASCII 4 = Ctrl+D
        return;
    }
    if (e.key === 'Enter') {
        const command = input.value;
        if (command.trim()) {
            history.push(command);
            hidx = history.length;
            socket.emit('terminal_input', { data: command + '\n' });
            input.value = '';
        }
    }
    else if (e.key == "ArrowUp") { e.preventDefault(); if (hidx > 0) { input.value = history[--hidx]; } }
    else if (e.key == "ArrowDown") { e.preventDefault(); if (hidx < history.length - 1) input.value = history[++hidx]; else hidx = history.length, input.value = ''; }


    // Store key if part of a combination
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
        keySequence.push(key);

        // Reset sequence timer
        clearTimeout(sequenceTimer);
        sequenceTimer = setTimeout(() => keySequence.length = 0, sequenceTimeout);

        // Handle Ctrl + A + D
        if (keySequence.includes('control') && keySequence.includes('a') && key === 'd') {
            e.preventDefault();
            keySequence.length = 0;

            // Detach logic
            appendToTerminal('Session detached.\n', 'success');
            if (socket && isTerminalConnected) {
                socket.emit('terminal_input', { data: '\x04' }); // Ctrl+D
            }
            return;
        }

        // Example: Ctrl + A + K (clear + signal)
        if (keySequence.includes('control') && keySequence.includes('a') && key === 'k') {
            e.preventDefault();
            keySequence.length = 0;
            clearTerminal();
            return;
        }

        // Example: Ctrl + A + L (clear + refocus)
        if (keySequence.includes('control') && keySequence.includes('a') && key === 'l') {
            e.preventDefault();
            keySequence.length = 0;
            clearTerminal();
            terminalInput.focus();
            return;
        }

        // Custom Combo: Ctrl + A + R => Restart terminal
        if (keySequence.includes('control') && keySequence.includes('a') && key === 'r') {
            e.preventDefault();
            keySequence.length = 0;
            restartTerminal();
            return;
        }

        if (e.key === ' ' || e.key === 'Spacebar') {
            const char = e.key;
            if (socket && isTerminalConnected) {
                socket.emit('terminal_input', { data: char });
            }
            e.preventDefault();
        }
    }
});


function createEditorTab(path) {
    const tabBar = document.getElementById('editor-tabs');
    const tab = document.createElement('div');
    tab.className = 'editor-tab';

    // File name span
    const fileNameSpan = document.createElement('span');
    fileNameSpan.textContent = path.split('/').pop();
    fileNameSpan.title = path;
    fileNameSpan.style.flex = '1';
    fileNameSpan.style.overflow = 'hidden';
    fileNameSpan.style.textOverflow = 'ellipsis';

    // Close button span
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '×'; // You can replace this with an SVG or icon
    closeBtn.className = 'close-btn';
    closeBtn.style.marginLeft = '8px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.title = 'Close tab';

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent tab click
        closeEditorTab(path);
    });

    tab.appendChild(fileNameSpan);
    tab.appendChild(closeBtn);

    tab.addEventListener('click', () => {
        if (openFiles[path]) {
            window.editor.setModel(openFiles[path].model);
            currentPath = path;
            highlightTab(path);
        }
    });

    tabBar.appendChild(tab);
    return tab;
}
function closeEditorTab(path) {
    const entry = openFiles[path];
    if (!entry) return;

    // Dispose model to free memory
    if (entry.model) {
        entry.model.dispose();
    }

    // Remove tab element
    if (entry.tabElement && entry.tabElement.parentNode) {
        entry.tabElement.remove();
    }

    delete openFiles[path];

    // Fallback to another open tab if needed
    const remainingPaths = Object.keys(openFiles);
    if (remainingPaths.length > 0) {
        const newPath = remainingPaths[0];
        window.editor.setModel(openFiles[newPath].model);
        currentPath = newPath;
        highlightTab(newPath);
    } else {
        window.editor.setModel(null);
        currentPath = null;
        document.getElementById('filename').textContent = 'No file selected';
    }
}


function highlightTab(path) {
    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.classList.remove('active-tab');
    });
    if (openFiles[path]) {
        openFiles[path].tabElement.classList.add('active-tab');
    }
}
