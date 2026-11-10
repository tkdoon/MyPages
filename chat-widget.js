// chat-widget.js — Floating AI chat widget using Gemini Interactions API
// API key is encrypted with a user password (PBKDF2 + AES-GCM) and stored in localStorage
(function () {
  // --- Load marked.js and KaTeX from CDN ---
  const markedScript = document.createElement('script');
  markedScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  document.head.appendChild(markedScript);

  const katexCss = document.createElement('link');
  katexCss.rel = 'stylesheet';
  katexCss.href = 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css';
  document.head.appendChild(katexCss);

  const katexScript = document.createElement('script');
  katexScript.src = 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js';
  document.head.appendChild(katexScript);

  const STORAGE_KEY = 'chat-widget-encrypted-key';
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const MODEL = 'gemini-3.5-flash-lite';

  const SUGGESTIONS = [
    'この内容をもっとわかりやすく説明して',
    '具体的な例を使って説明して',
    'この内容に関連して、他に知っておくべきことは？',
    'この内容の要点をまとめて',
  ];

  // --- Crypto helpers (PBKDF2 + AES-256-GCM) ---
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptApiKey(apiKeyText, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(apiKeyText));
    const buf = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    buf.set(salt, 0);
    buf.set(iv, salt.length);
    buf.set(new Uint8Array(ciphertext), salt.length + iv.length);
    return btoa(String.fromCharCode(...buf));
  }

  async function decryptApiKey(stored, password) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const salt = raw.slice(0, 16);
    const iv = raw.slice(16, 28);
    const ciphertext = raw.slice(28);
    const key = await deriveKey(password, salt);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(dec);
  }

  // --- Styles ---
  const DRAWER_WIDTH = '27rem';
  const style = document.createElement('style');
  style.textContent = `
    #cw-btn {
      position: fixed; top: 12px; right: 16px; z-index: 10000;
      background: none; border: 1px solid #555; border-radius: 6px;
      padding: 6px 14px; font-size: 14px; color: inherit; cursor: pointer;
      font-family: inherit;
    }
    #cw-btn:hover { border-color: #2563eb; color: #2563eb; }
    #cw-btn[aria-expanded="true"] { background: #2563eb; color: #fff; border-color: #2563eb; }

    #cw-panel {
      position: fixed; top: 0; right: 0; bottom: 0; width: ${DRAWER_WIDTH}; z-index: 10000;
      display: none; flex-direction: column;
      background: #1e1e1e; color: #e8e8e8; font-family: system-ui, sans-serif;
      border-left: 1px solid #333;
      font-size: 14px; line-height: 1.6;
    }
    #cw-panel.open { display: flex; }
    body.cw-open { margin-right: ${DRAWER_WIDTH}; }

    #cw-header {
      padding: 12px 16px; border-bottom: 1px solid #333;
      display: flex; justify-content: space-between; align-items: center;
    }
    #cw-header span { font-weight: 700; font-size: 15px; }
    #cw-header button {
      background: none; border: 1px solid #444; border-radius: 5px;
      color: #aaa; font-size: 13px; cursor: pointer; padding: 2px 8px;
    }
    #cw-header button:hover { color: #fff; border-color: #888; }

    #cw-messages {
      flex: 1; overflow-y: auto; padding: 16px;
    }
    .cw-msg { margin: 0 0 16px; font-size: 14px; line-height: 1.8; }
    .cw-msg.user {
      margin-left: 2.5rem; padding: 8px 12px; background: #253550; border-radius: 8px; white-space: pre-wrap;
    }
    .cw-msg.assistant { }
    .cw-msg.system { color: #888; font-size: 13px; text-align: center; }

    .cw-msg.assistant p { margin: 0 0 .7em; }
    .cw-msg.assistant p:last-child { margin-bottom: 0; }
    .cw-msg.assistant code { background: #252525; padding: 1px 5px; border-radius: 3px; font-size: 13px; border: 1px solid #333; }
    .cw-msg.assistant pre { background: #151515; padding: 10px 12px; border-radius: 6px; border: 1px solid #333; overflow-x: auto; margin: .5em 0; font-size: 13px; line-height: 1.65; }
    .cw-msg.assistant pre code { background: none; padding: 0; border: none; font-size: inherit; white-space: pre; }
    .cw-msg.assistant ul, .cw-msg.assistant ol { margin: .3em 0; padding-left: 1.4em; }
    .cw-msg.assistant li { margin: .15em 0; }
    .cw-msg.assistant h1, .cw-msg.assistant h2, .cw-msg.assistant h3 { font-size: 14px; font-weight: 700; margin: .6em 0 .3em; }
    .cw-msg.assistant a { color: #6cb4ee; }
    .cw-msg.assistant blockquote { border-left: 3px solid #555; padding-left: 8px; margin: .5em 0; color: #aaa; }
    .cw-msg.assistant table { border-collapse: collapse; margin: .5em 0; font-size: 13px; }
    .cw-msg.assistant th, .cw-msg.assistant td { border: 1px solid #444; padding: 4px 8px; }
    .cw-msg.assistant th { background: #252525; }

    .cw-msg .cw-msg-quote { border-left: 3px solid #2563eb; padding: 4px 8px; margin-bottom: 6px; font-size: 12px; color: #aaa; }

    .cw-intro { font-size: 13px; color: #888; margin: 0 0 12px; }
    .cw-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .cw-chip {
      background: #252525; border: 1px solid #444; border-radius: 999px;
      padding: 5px 12px; font-size: 12px; color: #ccc; cursor: pointer;
      text-align: left;
    }
    .cw-chip:hover { border-color: #2563eb; color: #fff; }

    .cw-composer { border-top: 1px solid #333; padding: 12px 16px; }
    .cw-quote { display: none; margin: 0 0 8px; padding: 5px 8px; font-size: 12px; color: #aaa; border-left: 3px solid #2563eb; background: #252525; border-radius: 0 4px 4px 0; }
    .cw-quote.on { display: flex; gap: 6px; align-items: flex-start; }
    .cw-quote-text { flex: 1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
    .cw-quote-clear { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; padding: 0; }
    .cw-quote-clear:hover { color: #e55; }
    #cw-input-area { display: flex; gap: 8px; }
    #cw-input {
      flex: 1; border: 1px solid #444; border-radius: 6px; padding: 8px 10px;
      background: #252525; color: #e8e8e8; font-size: 14px; outline: none;
      font-family: inherit;
    }
    #cw-input:focus { border-color: #2563eb; }
    #cw-send {
      padding: 8px 16px; border: none; border-radius: 6px;
      background: #2563eb; color: #fff; cursor: pointer; font-size: 14px;
    }
    #cw-send:disabled { opacity: .5; cursor: not-allowed; }

    #cw-key-form {
      padding: 16px; display: flex; flex-direction: column; gap: 10px;
    }
    #cw-key-form label { font-size: 13px; color: #aaa; }
    #cw-key-form small { color: #888; }
    #cw-key-form input {
      border: 1px solid #444; border-radius: 6px; padding: 8px 10px;
      background: #252525; color: #e8e8e8; font-size: 14px; outline: none;
    }
    #cw-key-form .cw-form-btn {
      padding: 8px; border: none; border-radius: 6px;
      background: #2563eb; color: #fff; cursor: pointer; font-size: 14px;
    }
    #cw-key-clear {
      background: none; border: none; color: #888; cursor: pointer;
      font-size: 12px; text-align: right; padding: 4px 0 0;
    }
    #cw-key-clear:hover { color: #e55; }

    @media (max-width: 860px) {
      #cw-panel { width: 100%; left: 0; }
      body.cw-open { margin-right: 0; }
    }
  `;
  document.head.appendChild(style);

  // --- DOM ---
  const btn = document.createElement('button');
  btn.id = 'cw-btn';
  btn.textContent = 'AIに質問';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'cw-panel');

  const panel = document.createElement('div');
  panel.id = 'cw-panel';
  panel.innerHTML = `
    <div id="cw-header">
      <span>AI Chat</span>
      <div style="display:flex;gap:6px">
        <button id="cw-new" title="新しいチャット">リセット</button>
        <button id="cw-close" title="閉じる">閉じる</button>
      </div>
    </div>
    <div id="cw-messages"></div>
    <div class="cw-composer">
      <div class="cw-quote" id="cw-quote">
        <span class="cw-quote-text" id="cw-quote-text"></span>
        <button class="cw-quote-clear" id="cw-quote-clear" title="引用を解除">&times;</button>
      </div>
      <div id="cw-input-area">
        <input id="cw-input" type="text" placeholder="質問を入力..." />
        <button id="cw-send">送信</button>
      </div>
    </div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#cw-messages');
  const inputEl = panel.querySelector('#cw-input');
  const sendBtn = panel.querySelector('#cw-send');
  const closeBtn = panel.querySelector('#cw-close');
  const newBtn = panel.querySelector('#cw-new');
  const composerEl = panel.querySelector('.cw-composer');
  const quoteBar = panel.querySelector('#cw-quote');
  const quoteTextEl = panel.querySelector('#cw-quote-text');
  const quoteClearBtn = panel.querySelector('#cw-quote-clear');

  let apiKey = '';
  let interactionId = null;
  let busy = false;
  let quoteText = '';
  let hasMessages = false;
  let capturedSelection = '';

  // --- Text selection / quote ---
  function getPageSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode) return '';
    // Only capture selections from the main page content, not from the chat panel
    if (panel.contains(sel.anchorNode)) return '';
    return sel.toString().trim().slice(0, 600);
  }

  function setQuote(text) {
    quoteText = text;
    quoteBar.classList.toggle('on', !!text);
    quoteTextEl.textContent = text ? '「' + text + '」' : '';
  }

  quoteClearBtn.addEventListener('click', () => setQuote(''));

  // Capture selection on mouseup in the page (when chat is open)
  document.addEventListener('mouseup', () => {
    if (!panel.classList.contains('open')) return;
    const sel = getPageSelection();
    if (sel) setQuote(sel);
  });

  // --- HTML to Markdown conversion ---
  function htmlToMarkdown(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style').forEach(n => n.remove());

    function convert(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const tag = node.tagName.toLowerCase();
      const children = Array.from(node.childNodes).map(convert).join('');

      switch (tag) {
        case 'h1': return '\n# ' + children.trim() + '\n';
        case 'h2': return '\n## ' + children.trim() + '\n';
        case 'h3': return '\n### ' + children.trim() + '\n';
        case 'h4': return '\n#### ' + children.trim() + '\n';
        case 'p': return '\n' + children.trim() + '\n';
        case 'br': return '\n';
        case 'strong': case 'b': return '**' + children.trim() + '**';
        case 'em': case 'i': return '*' + children.trim() + '*';
        case 'code':
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') return children;
          return '`' + children.trim() + '`';
        case 'pre': {
          const codeEl = node.querySelector('code');
          const lang = codeEl ? (codeEl.className.match(/language-(\w+)/)?.[1] || '') : '';
          const code = (codeEl || node).textContent.trim();
          return '\n```' + lang + '\n' + code + '\n```\n';
        }
        case 'ul': return '\n' + Array.from(node.children).map(li => '- ' + convert(li).trim()).join('\n') + '\n';
        case 'ol': return '\n' + Array.from(node.children).map((li, i) => (i + 1) + '. ' + convert(li).trim()).join('\n') + '\n';
        case 'li': return children;
        case 'a': {
          const href = node.getAttribute('href');
          return href ? '[' + children.trim() + '](' + href + ')' : children;
        }
        case 'blockquote': return '\n> ' + children.trim().replace(/\n/g, '\n> ') + '\n';
        case 'table': return '\n' + tableToMarkdown(node) + '\n';
        case 'div': case 'span': case 'section': case 'article': case 'main': case 'header': case 'footer': case 'nav':
          return children;
        default: return children;
      }
    }

    function tableToMarkdown(table) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const result = [];
      rows.forEach((row, i) => {
        const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim());
        result.push('| ' + cells.join(' | ') + ' |');
        if (i === 0) result.push('| ' + cells.map(() => '---').join(' | ') + ' |');
      });
      return result.join('\n');
    }

    return convert(clone).replace(/\n{3,}/g, '\n\n').trim();
  }

  // --- Page content extraction ---
  function extractSections() {
    const sections = [];
    document.querySelectorAll('section[id]').forEach(sec => {
      const heading = sec.querySelector('h2');
      const title = heading ? heading.textContent.trim() : sec.id;
      const text = htmlToMarkdown(sec);
      sections.push({ id: sec.id, title, text, el: sec });
    });
    return sections;
  }

  const pageSections = extractSections();
  const pageTitle = document.title || '';

  function getToc() {
    return pageSections.map((s, i) => (i + 1) + '. ' + s.title).join('\n');
  }

  // Track which section is currently visible
  let visibleSectionId = pageSections.length > 0 ? pageSections[0].id : null;
  if (pageSections.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visibleSectionId = entry.target.id;
      });
    }, { rootMargin: '0px 0px -60% 0px', threshold: 0 });
    pageSections.forEach(s => observer.observe(s.el));
  }

  // Find sections relevant to user's question by keyword matching
  function findRelevantSections(question) {
    const keywords = question
      .replace(/[？?。、！!,.]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
    if (keywords.length === 0) return [];

    const scored = pageSections.map(s => {
      const lower = (s.title + ' ' + s.text).toLowerCase();
      const hits = keywords.filter(k => lower.includes(k.toLowerCase())).length;
      return { ...s, score: hits };
    }).filter(s => s.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 2);
  }

  let lastSystemInstruction = '';

  function buildSystemInstruction(question) {
    let context = [
      '# 役割',
      'あなたはWebページ「' + pageTitle + '」の内容に詳しいアシスタントです。',
      '',
      '# 状況',
      '- ユーザーはこのページを読みながら質問しています',
      '- ページの内容を踏まえて回答してください',
      '- ページと関係のない質問にも答えてかまいません',
      '',
      '# 回答フォーマット',
      '- 言語: 日本語',
      '- 構造化を多用してください:',
      '  - 見出し（##, ###）で内容を区切る',
      '  - 箇条書きで要点を整理する',
      '  - 表で比較・対照を示す',
      '  - コード例は ```言語名 のコードブロックで示す',
      '  - 数式は $...$ または $$...$$ のLaTeX記法で示す',
      '- 長さ: 簡潔に、ただし必要な情報は省略しない',
      '',
      '# 回答のルール',
      '- 確信が持てない内容は「推測ですが」等と明記する',
      '- ページの内容に誤りや不正確な点があれば遠慮なく指摘する',
      '- 専門用語は初出時に簡単な説明を添える',
      '',
    ].join('\n');

    context += '--- 目次 ---\n' + getToc() + '\n\n';

    const visible = pageSections.find(s => s.id === visibleSectionId);
    const added = new Set();
    if (visible) {
      context += '--- ユーザーが閲覧中のセクション: ' + visible.title + ' ---\n' + visible.text + '\n\n';
      added.add(visible.id);
    }

    const relevant = findRelevantSections(question);
    if (relevant.length > 0) {
      for (const sec of relevant) {
        if (added.has(sec.id)) continue;
        context += '--- 関連セクション: ' + sec.title + ' ---\n' + sec.text + '\n\n';
        added.add(sec.id);
      }
      lastSystemInstruction = context;
      return context;
    }

    if (lastSystemInstruction) return lastSystemInstruction;
    lastSystemInstruction = context;
    return context;
  }

  // --- Toggle ---
  function hasStoredKey() {
    return !!localStorage.getItem(STORAGE_KEY);
  }

  function openDrawer(sel) {
    panel.classList.add('open');
    document.body.classList.add('cw-open');
    btn.setAttribute('aria-expanded', 'true');
    if (sel) setQuote(sel);
    if (!apiKey) {
      if (hasStoredKey()) showPasswordForm();
      else showSetupForm();
    } else {
      if (!hasMessages) showWelcome();
      inputEl.focus();
    }
  }

  function closeDrawer() {
    panel.classList.remove('open');
    document.body.classList.remove('cw-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('pointerdown', () => { capturedSelection = getPageSelection(); });
  btn.addEventListener('click', () => {
    const sel = capturedSelection || getPageSelection();
    capturedSelection = '';
    const isOpen = panel.classList.contains('open');
    if (isOpen && !sel) closeDrawer();
    else openDrawer(sel);
  });
  closeBtn.addEventListener('click', closeDrawer);
  newBtn.addEventListener('click', () => {
    interactionId = null;
    lastSystemInstruction = '';
    hasMessages = false;
    setQuote('');
    showWelcome();
    inputEl.focus();
  });

  // --- Welcome screen with suggestions ---
  function showWelcome() {
    messagesEl.innerHTML = '';
    const intro = document.createElement('p');
    intro.className = 'cw-intro';
    intro.textContent = 'このページの内容を踏まえて回答します。本文を選択すると引用して質問できます。';
    messagesEl.appendChild(intro);

    const chips = document.createElement('div');
    chips.className = 'cw-chips';
    SUGGESTIONS.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'cw-chip';
      chip.textContent = s;
      chip.addEventListener('click', () => {
        inputEl.value = s;
        send();
      });
      chips.appendChild(chip);
    });
    messagesEl.appendChild(chips);
  }

  // --- Initial setup form (API key + password) ---
  function showSetupForm() {
    messagesEl.innerHTML = '';
    composerEl.style.display = 'none';
    quoteBar.classList.remove('on');
    removeClearBtn();

    const form = document.createElement('div');
    form.id = 'cw-key-form';
    form.innerHTML = `
      <label>Gemini APIキーを入力してください<br><small>暗号化してブラウザに保存します（<a href="https://aistudio.google.com/apikey" target="_blank" style="color:#6cb4ee">取得はこちら</a>）</small></label>
      <input type="password" id="cw-apikey-input" placeholder="AIza..." />
      <label>暗号化パスワード<br><small>次回以降はこのパスワードで復号します</small></label>
      <input type="password" id="cw-pw-input" placeholder="パスワード" />
      <input type="password" id="cw-pw-confirm" placeholder="パスワード（確認）" />
      <button class="cw-form-btn" id="cw-setup-save">保存して開始</button>
    `;
    messagesEl.appendChild(form);
    form.querySelector('#cw-apikey-input').focus();

    async function save() {
      const key = form.querySelector('#cw-apikey-input').value.trim();
      const pw = form.querySelector('#cw-pw-input').value;
      const pw2 = form.querySelector('#cw-pw-confirm').value;
      if (!key) { addMsg('system', 'APIキーを入力してください'); return; }
      if (!pw) { addMsg('system', 'パスワードを入力してください'); return; }
      if (pw !== pw2) { addMsg('system', 'パスワードが一致しません'); return; }
      try {
        const encrypted = await encryptApiKey(key, pw);
        localStorage.setItem(STORAGE_KEY, encrypted);
        apiKey = key;
        composerEl.style.display = '';
        addClearKeyButton();
        showWelcome();
        inputEl.focus();
      } catch (e) {
        addMsg('system', 'エラー: ' + e.message);
      }
    }
    form.querySelector('#cw-setup-save').addEventListener('click', save);
    form.querySelectorAll('input').forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    });
  }

  // --- Password unlock form (returning user) ---
  function showPasswordForm() {
    messagesEl.innerHTML = '';
    composerEl.style.display = 'none';
    quoteBar.classList.remove('on');
    removeClearBtn();

    const form = document.createElement('div');
    form.id = 'cw-key-form';
    form.innerHTML = `
      <label>パスワードを入力してAPIキーを復号</label>
      <input type="password" id="cw-unlock-pw" placeholder="パスワード" />
      <button class="cw-form-btn" id="cw-unlock-btn">解除</button>
    `;
    messagesEl.appendChild(form);
    form.querySelector('#cw-unlock-pw').focus();

    async function unlock() {
      const pw = form.querySelector('#cw-unlock-pw').value;
      if (!pw) return;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        apiKey = await decryptApiKey(stored, pw);
        composerEl.style.display = '';
        addClearKeyButton();
        showWelcome();
        inputEl.focus();
      } catch {
        addMsg('system', 'パスワードが正しくありません');
      }
    }
    form.querySelector('#cw-unlock-btn').addEventListener('click', unlock);
    form.querySelector('#cw-unlock-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
  }

  // --- Clear key button ---
  function removeClearBtn() {
    const existing = panel.querySelector('#cw-key-clear');
    if (existing) existing.remove();
  }

  function addClearKeyButton() {
    removeClearBtn();
    const clearBtn = document.createElement('button');
    clearBtn.id = 'cw-key-clear';
    clearBtn.textContent = 'APIキーをリセット';
    clearBtn.addEventListener('click', () => {
      apiKey = '';
      localStorage.removeItem(STORAGE_KEY);
      interactionId = null;
      hasMessages = false;
      showSetupForm();
    });
    composerEl.appendChild(clearBtn);
  }

  // --- Markdown + LaTeX rendering ---
  let markedConfigured = false;
  function renderMarkdown(text) {
    const latexBlocks = [];
    let protected_ = text
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
        latexBlocks.push({ expr, display: true });
        return '\x00LATEX' + (latexBlocks.length - 1) + '\x00';
      })
      .replace(/\$([^\$\n]+?)\$/g, (_, expr) => {
        latexBlocks.push({ expr, display: false });
        return '\x00LATEX' + (latexBlocks.length - 1) + '\x00';
      });

    let html;
    if (typeof marked !== 'undefined') {
      if (!markedConfigured) {
        marked.setOptions({ gfm: true, breaks: true });
        markedConfigured = true;
      }
      html = marked.parse(protected_);
    } else {
      html = protected_.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    html = html.replace(/\x00LATEX(\d+)\x00/g, (_, idx) => {
      const block = latexBlocks[parseInt(idx)];
      if (typeof katex !== 'undefined') {
        try {
          return katex.renderToString(block.expr.trim(), { displayMode: block.display, throwOnError: false });
        } catch { return block.expr; }
      }
      return (block.display ? '$$' : '$') + block.expr + (block.display ? '$$' : '$');
    });

    return html;
  }

  // Throttled markdown render for streaming
  let renderTimer = null;
  function scheduleRender(el, text) {
    if (renderTimer) return;
    renderTimer = requestAnimationFrame(() => {
      el.innerHTML = renderMarkdown(text);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      renderTimer = null;
    });
  }

  // --- Messages ---
  function addMsg(role, text, quote) {
    const div = document.createElement('div');
    div.className = 'cw-msg ' + role;
    if (role === 'user') {
      if (quote) {
        const q = document.createElement('div');
        q.className = 'cw-msg-quote';
        q.textContent = '「' + quote + '」';
        div.appendChild(q);
      }
      const span = document.createTextNode(text);
      div.appendChild(span);
    } else if (role === 'assistant' && text) {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  // --- Send ---
  async function send() {
    const text = inputEl.value.trim();
    if (!text || busy) return;
    if (!apiKey) { showPasswordForm(); return; }

    const quote = quoteText;
    const input = quote ? 'ページの次の部分について質問です。\n「' + quote + '」\n\n' + text : text;

    // Clear welcome on first message
    if (!hasMessages) {
      messagesEl.innerHTML = '';
      hasMessages = true;
    }

    addMsg('user', text, quote);
    inputEl.value = '';
    setQuote('');
    busy = true;
    sendBtn.disabled = true;

    const thinking = addMsg('assistant', '');

    try {
      const reqBody = {
        model: MODEL,
        system_instruction: buildSystemInstruction(input),
        input: input,
        stream: true,
      };
      if (interactionId) {
        reqBody.previous_interaction_id = interactionId;
      }

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = 'API error: ' + res.status;
        try { msg = JSON.parse(errText).error?.message || msg; } catch {}
        throw new Error(msg);
      }

      // Parse SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          const event = JSON.parse(jsonStr);

          if (event.event_type === 'error') {
            throw new Error(event.error?.message || 'Stream error');
          }
          if (event.event_type === 'step.delta' && event.delta?.type === 'text') {
            fullText += event.delta.text;
            scheduleRender(thinking, fullText);
          }
          if (event.interaction?.id) {
            interactionId = event.interaction.id;
          }
        }
      }

      // Final render
      if (fullText) {
        thinking.innerHTML = renderMarkdown(fullText);
      } else {
        thinking.textContent = '(応答なし)';
      }
    } catch (e) {
      // Error recovery: restore question to input
      thinking.remove();
      addMsg('system', '回答を取得できませんでした。質問を入力欄に戻しました。');
      inputEl.value = text;
      if (quote) setQuote(quote);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) send();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) closeDrawer();
  });
})();
