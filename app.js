const API = "https://api.github.com";

const elements = {
  welcome: document.querySelector("#welcome"),
  reader: document.querySelector("#reader"),
  form: document.querySelector("#repo-form"),
  input: document.querySelector("#repo-input"),
  error: document.querySelector("#form-error"),
  name: document.querySelector("#repo-name"),
  description: document.querySelector("#repo-description"),
  meta: document.querySelector("#repo-meta"),
  tree: document.querySelector("#file-tree"),
  content: document.querySelector("#file-content"),
  breadcrumb: document.querySelector("#breadcrumb"),
  githubLink: document.querySelector("#github-link"),
  loading: document.querySelector("#loading"),
  back: document.querySelector("#back-button"),
  theme: document.querySelector("#theme-button"),
  resetOrder: document.querySelector("#reset-order-button"),
  exportOrder: document.querySelector("#export-order-button"),
  previousFile: document.querySelector("#previous-file-button"),
  nextFile: document.querySelector("#next-file-button"),
  tokenInput: document.querySelector("#token-input"),
  connect: document.querySelector("#connect-button"),
  disconnect: document.querySelector("#disconnect-button"),
  connectionStatus: document.querySelector("#connection-status"),
  connectionError: document.querySelector("#connection-error"),
};

let currentRepo = null;
let currentFiles = [];
let currentPath = null;
let accessToken = sessionStorage.getItem("repo-reader-token") || "";

function parseRepository(value) {
  const cleaned = value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  const [owner, repo, ...rest] = cleaned.split("/");
  if (!owner || !repo || rest.length) throw new Error("Use uma URL do GitHub ou o formato owner/repo.");
  return { owner, repo, fullName: `${owner}/${repo}` };
}

async function github(path) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${API}${path}`, { headers });
  if (response.status === 401) throw new Error("O token é inválido ou expirou.");
  if (response.status === 404) throw new Error(accessToken ? "Repositório não encontrado ou não autorizado para este token." : "Repositório não encontrado. Para repositórios privados, conecte um token de leitura.");
  if (response.status === 403) throw new Error("Acesso negado ou limite da API do GitHub atingido.");
  if (!response.ok) throw new Error("Não foi possível consultar o GitHub.");
  return response.json();
}

async function connectGitHub() {
  const candidate = elements.tokenInput.value.trim();
  elements.connectionError.textContent = "";
  if (!candidate) {
    elements.connectionError.textContent = "Cole um token fine-grained para conectar.";
    return;
  }
  const previous = accessToken;
  accessToken = candidate;
  elements.connect.disabled = true;
  try {
    const user = await github("/user");
    sessionStorage.setItem("repo-reader-token", accessToken);
    elements.tokenInput.value = "";
    updateConnectionStatus(user.login);
  } catch (error) {
    accessToken = previous;
    elements.connectionError.textContent = error.message;
  } finally {
    elements.connect.disabled = false;
  }
}

function disconnectGitHub() {
  accessToken = "";
  sessionStorage.removeItem("repo-reader-token");
  updateConnectionStatus();
}

function updateConnectionStatus(login = "") {
  elements.connectionStatus.textContent = accessToken ? `Conectado${login ? ` como ${login}` : ""}` : "Acesso público";
  elements.disconnect.hidden = !accessToken;
}

async function openRepository(value) {
  elements.error.textContent = "";
  const parsed = parseRepository(value);
  setLoading(true);
  try {
    const repo = await github(`/repos/${parsed.fullName}`);
    const branch = encodeURIComponent(repo.default_branch);
    const tree = await github(`/repos/${parsed.fullName}/git/trees/${branch}?recursive=1`);
    currentRepo = repo;
    const repositoryTree = tree.tree || [];
    const canonicalOrder = await loadRepositoryOrder(repo, repositoryTree);
    renderRepository(repo, repositoryTree, canonicalOrder);
    history.replaceState(null, "", `#${repo.full_name}`);
    const readme = (tree.tree || []).find((item) => item.type === "blob" && /^readme(\.md)?$/i.test(item.path));
    if (readme) await openFile(readme.path);
    else renderEmpty("Selecione um arquivo para começar a leitura.");
  } finally {
    setLoading(false);
  }
}

function renderRepository(repo, tree, canonicalOrder = []) {
  elements.welcome.hidden = true;
  elements.reader.hidden = false;
  elements.name.textContent = repo.name;
  elements.description.textContent = repo.description || "Sem descrição.";
  elements.meta.innerHTML = `<span>${escapeHtml(repo.language || "—")}</span><span>★ ${repo.stargazers_count}</span><span>${escapeHtml(repo.default_branch)}</span>`;
  const files = tree
    .filter((item) => item.type === "blob" && item.path !== ".repo-reader.json")
    .sort((a, b) => a.path.localeCompare(b.path));
  currentFiles = applySavedOrder(files, canonicalOrder);
  renderFileTree();
}

function renderFileTree() {
  elements.tree.replaceChildren();
  currentFiles.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "tree-row";

    const number = document.createElement("span");
    number.className = "order-number";
    number.textContent = index + 1;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-item";
    button.textContent = item.path;
    button.title = item.path;
    button.dataset.path = item.path;
    button.classList.toggle("active", item.path === currentPath);
    button.addEventListener("click", () => openFile(item.path));

    const up = createMoveButton("↑", "Mover para cima", index, -1);
    const down = createMoveButton("↓", "Mover para baixo", index, 1);
    up.disabled = index === 0;
    down.disabled = index === currentFiles.length - 1;
    row.append(number, button, up, down);
    elements.tree.append(row);
  });
}

function createMoveButton(label, title, index, direction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "move-button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", () => moveFile(index, direction));
  return button;
}

function moveFile(index, direction) {
  const destination = index + direction;
  if (destination < 0 || destination >= currentFiles.length) return;
  [currentFiles[index], currentFiles[destination]] = [currentFiles[destination], currentFiles[index]];
  saveOrder();
  renderFileTree();
  updateNavigation();
}

async function loadRepositoryOrder(repo, tree) {
  const config = tree.find((item) => item.type === "blob" && item.path === ".repo-reader.json");
  if (!config) return [];

  try {
    const file = await github(`/repos/${repo.full_name}/contents/.repo-reader.json?ref=${encodeURIComponent(repo.default_branch)}`);
    const parsed = JSON.parse(decodeBase64(file.content || ""));
    return Array.isArray(parsed.order) ? parsed.order.filter((path) => typeof path === "string") : [];
  } catch (error) {
    console.warn("Não foi possível ler .repo-reader.json:", error);
    return [];
  }
}

function applySavedOrder(files, canonicalOrder = []) {
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(orderStorageKey()) || "[]");
  } catch {
    localStorage.removeItem(orderStorageKey());
  }
  const preferredOrder = Array.isArray(saved) && saved.length ? saved : canonicalOrder;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const ordered = preferredOrder.map((path) => byPath.get(path)).filter(Boolean);
  const included = new Set(ordered.map((file) => file.path));
  return [...ordered, ...files.filter((file) => !included.has(file.path))];
}

function exportOrder() {
  if (!currentRepo || !currentFiles.length) return;
  const configuration = {
    version: 1,
    repository: currentRepo.full_name,
    order: currentFiles.map((file) => file.path),
  };
  const blob = new Blob([`${JSON.stringify(configuration, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = ".repo-reader.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function orderStorageKey() { return `repo-reader-order:${currentRepo.full_name}`; }
function saveOrder() { localStorage.setItem(orderStorageKey(), JSON.stringify(currentFiles.map((file) => file.path))); }

async function openFile(path) {
  if (!currentRepo) return;
  currentPath = path;
  setLoading(true);
  elements.content.replaceChildren();
  elements.breadcrumb.textContent = path;
  elements.githubLink.href = `${currentRepo.html_url}/blob/${currentRepo.default_branch}/${path.split("/").map(encodeURIComponent).join("/")}`;
  document.querySelectorAll(".tree-item").forEach((item) => item.classList.toggle("active", item.dataset.path === path));
  updateNavigation();
  try {
    const file = await github(`/repos/${currentRepo.full_name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(currentRepo.default_branch)}`);
    if (file.size > 1_000_000 || !file.content) return renderEmpty("Este arquivo é grande demais ou não pode ser exibido como texto.");
    const text = decodeBase64(file.content);
    if (/\.md$/i.test(path)) elements.content.innerHTML = renderMarkdown(text);
    else {
      const pre = document.createElement("pre");
      pre.className = "plain-file";
      pre.textContent = text;
      elements.content.append(pre);
    }
  } catch (error) {
    renderEmpty(error.message);
  } finally {
    setLoading(false);
  }
}

function updateNavigation() {
  const index = currentFiles.findIndex((file) => file.path === currentPath);
  elements.previousFile.disabled = index <= 0;
  elements.nextFile.disabled = index < 0 || index >= currentFiles.length - 1;
}

function openRelativeFile(offset) {
  const index = currentFiles.findIndex((file) => file.path === currentPath);
  const target = currentFiles[index + offset];
  if (target) openFile(target.path);
}

function renderMarkdown(source) {
  const escaped = escapeHtml(source);
  const codeBlocks = [];
  let html = escaped.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, language, code) => {
    const token = `%%CODEBLOCK${codeBlocks.length}%%`;
    codeBlocks.push(`<pre><code${language ? ` data-language="${language}"` : ""}>${code.trimEnd()}</code></pre>`);
    return token;
  });
  html = html
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .split(/\n{2,}/)
    .map((block) => /^(<h\d|<ul|<blockquote|%%CODEBLOCK)/.test(block) ? block : `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  codeBlocks.forEach((block, index) => { html = html.replace(`<p>%%CODEBLOCK${index}%%</p>`, block).replace(`%%CODEBLOCK${index}%%`, block); });
  return html;
}

function decodeBase64(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, "")), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function renderEmpty(message) { elements.content.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`; }
function setLoading(active) { elements.loading.hidden = !active; }

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await openRepository(elements.input.value); }
  catch (error) { elements.error.textContent = error.message; setLoading(false); }
});

elements.back.addEventListener("click", () => {
  currentRepo = null;
  currentFiles = [];
  currentPath = null;
  elements.reader.hidden = true;
  elements.welcome.hidden = false;
  history.replaceState(null, "", location.pathname);
  elements.input.focus();
});

elements.resetOrder.addEventListener("click", () => {
  currentFiles.sort((a, b) => a.path.localeCompare(b.path));
  saveOrder();
  renderFileTree();
  updateNavigation();
});
elements.exportOrder.addEventListener("click", exportOrder);

elements.previousFile.addEventListener("click", () => openRelativeFile(-1));
elements.nextFile.addEventListener("click", () => openRelativeFile(1));
elements.connect.addEventListener("click", connectGitHub);
elements.disconnect.addEventListener("click", disconnectGitHub);
elements.tokenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connectGitHub();
});

elements.theme.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  localStorage.setItem("repo-reader-theme", dark ? "light" : "dark");
});

document.documentElement.dataset.theme = localStorage.getItem("repo-reader-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
updateConnectionStatus();
if (location.hash.length > 1) {
  elements.input.value = decodeURIComponent(location.hash.slice(1));
  openRepository(elements.input.value).catch((error) => { elements.error.textContent = error.message; setLoading(false); });
}
