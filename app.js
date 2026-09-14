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
};

let currentRepo = null;

function parseRepository(value) {
  const cleaned = value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  const [owner, repo, ...rest] = cleaned.split("/");
  if (!owner || !repo || rest.length) throw new Error("Use uma URL do GitHub ou o formato owner/repo.");
  return { owner, repo, fullName: `${owner}/${repo}` };
}

async function github(path) {
  const response = await fetch(`${API}${path}`, { headers: { Accept: "application/vnd.github+json" } });
  if (response.status === 404) throw new Error("Repositório ou arquivo não encontrado.");
  if (response.status === 403) throw new Error("Limite da API do GitHub atingido. Tente novamente mais tarde.");
  if (!response.ok) throw new Error("Não foi possível consultar o GitHub.");
  return response.json();
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
    renderRepository(repo, tree.tree || []);
    history.replaceState(null, "", `#${repo.full_name}`);
    const readme = (tree.tree || []).find((item) => item.type === "blob" && /^readme(\.md)?$/i.test(item.path));
    if (readme) await openFile(readme.path);
    else renderEmpty("Selecione um arquivo para começar a leitura.");
  } finally {
    setLoading(false);
  }
}

function renderRepository(repo, tree) {
  elements.welcome.hidden = true;
  elements.reader.hidden = false;
  elements.name.textContent = repo.name;
  elements.description.textContent = repo.description || "Sem descrição.";
  elements.meta.innerHTML = `<span>${escapeHtml(repo.language || "—")}</span><span>★ ${repo.stargazers_count}</span><span>${escapeHtml(repo.default_branch)}</span>`;
  elements.tree.replaceChildren();
  tree.filter((item) => item.type === "blob").sort((a, b) => a.path.localeCompare(b.path)).forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-item";
    button.textContent = item.path;
    button.title = item.path;
    button.dataset.path = item.path;
    button.addEventListener("click", () => openFile(item.path));
    elements.tree.append(button);
  });
}

async function openFile(path) {
  if (!currentRepo) return;
  setLoading(true);
  elements.content.replaceChildren();
  elements.breadcrumb.textContent = path;
  elements.githubLink.href = `${currentRepo.html_url}/blob/${currentRepo.default_branch}/${path.split("/").map(encodeURIComponent).join("/")}`;
  document.querySelectorAll(".tree-item").forEach((item) => item.classList.toggle("active", item.dataset.path === path));
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
  elements.reader.hidden = true;
  elements.welcome.hidden = false;
  history.replaceState(null, "", location.pathname);
  elements.input.focus();
});

elements.theme.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  localStorage.setItem("repo-reader-theme", dark ? "light" : "dark");
});

document.documentElement.dataset.theme = localStorage.getItem("repo-reader-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
if (location.hash.length > 1) {
  elements.input.value = decodeURIComponent(location.hash.slice(1));
  openRepository(elements.input.value).catch((error) => { elements.error.textContent = error.message; setLoading(false); });
}
