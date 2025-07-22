
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
        if (e.key === 'Enter') {
            const command = input.value;
            if (command.trim()) {
                history.push(command);
                hidx = history.length;
                socket.emit('terminal_input', { data: command + '\n' });
                input.value = '';
            }
        } else if (e.key == "ArrowUp") { e.preventDefault(); if (hidx > 0) { input.value = history[--hidx]; } }
        else if (e.key == "ArrowDown") { e.preventDefault(); if (hidx < history.length - 1) input.value = history[++hidx]; else hidx = history.length, input.value = ''; }
    });

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

function openFile(path) {
    fetch(`/api/read?path=${path}`)
        .then(res => res.text())
        .then(content => {
            if (window.editor) {
                window.editor.setValue(content);
            }
            document.getElementById("filename").textContent = path;
            currentPath = path;
        })
        .catch(err => {
            console.error('Failed to open file:', err);
            alert('Failed to open file: ' + err.message);
        });
}

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

    // terminalOutput.addEventListener('mouseup', () => {
    //     const selection = window.getSelection();
    //     const selectedText = selection.toString().trim();
    //     if (selectedText.length > 0) {
    //         navigator.clipboard.writeText(selectedText).catch(err => {
    //             console.error("Clipboard write failed", err);
    //         });
    //     }
    // });


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
// Initialize Monaco Editor and Terminal
require.config({
    paths: {
        vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs"
    }
});

require(["vs/editor/editor.main"], function () {
    window.editor = monaco.editor.create(document.getElementById("monaco"), {
        value: "",
        language: "python",
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 14,
        lineNumbers: "on",
        roundedSelection: false,
        scrollBeyondLastLine: false,
        readOnly: false,
        minimap: { enabled: true }
    });

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
