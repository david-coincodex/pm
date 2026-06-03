import { setPluginConfig, defaultHtmlPreset, defaultMarkdownPreset } from '@_sh/strapi-plugin-ckeditor';
import type { Preset } from '@_sh/strapi-plugin-ckeditor';
import { Plugin, ButtonView } from 'ckeditor5';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ─── PROS / CONS ──────────────────────────────────────────────────────────────

class ProsConsPlugin extends Plugin {
  static get pluginName() {
    return 'ProsConsPlugin' as const;
  }

  _openDialog(prefill: { pros: string[]; cons: string[]; _modelEl?: any } | null = null) {
    const editor = this.editor;
    const savedRange = editor.model.document.selection.getFirstRange();

    const dlg = document.createElement('dialog');
    dlg.style.cssText =
      'padding:0;border:none;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.25);width:460px;z-index:99999;';

    dlg.innerHTML = [
      '<form method="dialog" style="padding:24px;font-family:system-ui,sans-serif;">',
      `<h3 style="margin:0 0 20px;font-size:16px;font-weight:600;">${prefill ? 'Edit' : 'Insert'} Pros &amp; Cons</h3>`,
      '<div style="margin-bottom:16px;">',
      '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#16a34a;">✓ Pros – one item per line</label>',
      '<textarea name="pros" rows="5" style="display:block;width:100%;padding:8px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Fast performance&#10;Easy setup&#10;Great support"></textarea>',
      '</div>',
      '<div style="margin-bottom:24px;">',
      '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#dc2626;">✗ Cons – one item per line</label>',
      '<textarea name="cons" rows="5" style="display:block;width:100%;padding:8px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Expensive pricing&#10;Limited free tier"></textarea>',
      '</div>',
      '<div style="display:flex;gap:8px;justify-content:flex-end;">',
      '<button type="button" class="ck-pros-cons-cancel" style="padding:7px 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:13px;cursor:pointer;">Cancel</button>',
      `<button type="submit" style="padding:7px 16px;border:none;border-radius:4px;background:#4945ff;color:#fff;font-size:13px;cursor:pointer;font-weight:500;">${prefill ? 'Update' : 'Insert'}</button>`,
      '</div></form>',
    ].join('');

    document.body.appendChild(dlg);

    const prosTA = dlg.querySelector('textarea[name="pros"]') as HTMLTextAreaElement;
    const consTA = dlg.querySelector('textarea[name="cons"]') as HTMLTextAreaElement;
    if (prefill) {
      prosTA.value = prefill.pros.join('\n');
      consTA.value = prefill.cons.join('\n');
    }

    dlg.querySelector('.ck-pros-cons-cancel')?.addEventListener('click', () => {
      (dlg as HTMLDialogElement).close();
      dlg.remove();
    });

    dlg.querySelector('form')?.addEventListener('submit', (e: Event) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const prosRaw = (fd.get('pros') as string) ?? '';
      const consRaw = (fd.get('cons') as string) ?? '';
      (dlg as HTMLDialogElement).close();
      dlg.remove();

      const pros = prosRaw.split('\n').map((s) => s.trim()).filter(Boolean);
      const cons = consRaw.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!pros.length && !cons.length) return;

      const prosHtml = pros.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
      const consHtml = cons.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
      const prosData = pros.map((p) => escapeHtml(p)).join('||');
      const consData = cons.map((c) => escapeHtml(c)).join('||');

      const html =
        `<div class="pros-cons-block" data-component="pros-cons" data-pros="${prosData}" data-cons="${consData}" contenteditable="false">` +
        `<div class="pros-cons-block__pros"><ul>${prosHtml}</ul></div>` +
        `<div class="pros-cons-block__cons"><ul>${consHtml}</ul></div>` +
        `</div>`;

      if (prefill?._modelEl) {
        editor.model.change((writer) => writer.setSelection(prefill._modelEl, 'on'));
      } else if (prefill && savedRange) {
        editor.model.change((writer) => writer.setSelection(savedRange));
      }
      const viewFragment = (editor.data.processor as any).toView(html);
      const modelFragment = editor.data.toModel(viewFragment);
      editor.model.insertContent(modelFragment);
      editor.editing.view.focus();
    });

    (dlg as HTMLDialogElement).showModal();
    setTimeout(() => prosTA.focus(), 50);
  }

  init() {
    const editor = this.editor;

    editor.ui.componentFactory.add('prosCons', (locale) => {
      const button = new ButtonView(locale);
      button.set({ label: 'Pros & Cons', withText: true, tooltip: true });
      button.on('execute', () => this._openDialog(null));
      return button;
    });

    editor.on('ready', () => {
      const editableEl = editor.editing.view.getDomRoot();
      if (!editableEl) return;
      editableEl.addEventListener('dblclick', (e: MouseEvent) => {
        let el = e.target as HTMLElement | null;
        while (el && el.dataset?.component !== 'pros-cons') el = el.parentElement;
        if (!el) return;
        e.stopPropagation();
        const unescape = (s: string) =>
          s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        const pros = (el.dataset.pros ?? '').split('||').filter(Boolean).map(unescape);
        const cons = (el.dataset.cons ?? '').split('||').filter(Boolean).map(unescape);
        const viewEl = editor.editing.view.domConverter.mapDomToView(el as Element);
        const _modelEl = viewEl ? editor.editing.mapper.toModelElement(viewEl as any) : null;
        this._openDialog({ pros, cons, _modelEl });
      });
    });
  }
}

// ─── SITE CARD ────────────────────────────────────────────────────────────────

class SiteCardPlugin extends Plugin {
  static get pluginName() {
    return 'SiteCardPlugin' as const;
  }

  _openDialog(prefill: { id: number; name: string; _modelEl?: any } | null = null) {
    const editor = this.editor;
    const savedRange = editor.model.document.selection.getFirstRange();

    const dlg = document.createElement('dialog');
    dlg.style.cssText =
      'padding:0;border:none;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.25);width:400px;z-index:99999;';

    const currentInfo = prefill
      ? `<p style="margin:0 0 12px;font-size:13px;color:#64748b;">Current: <strong>${escapeHtml(prefill.name || '#' + prefill.id)}</strong> — search below to replace</p>`
      : '';
    dlg.innerHTML = [
      '<div style="padding:24px;font-family:system-ui,sans-serif;">',
      `<h3 style="margin:0 0 16px;font-size:16px;font-weight:600;">${prefill ? 'Edit' : 'Insert'} Site Card</h3>`,
      currentInfo,
      '<input type="text" class="pm-site-search-input" placeholder="Search sites\u2026" style="display:block;width:100%;padding:8px 12px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;font-size:13px;font-family:inherit;" />',
      '<div class="pm-site-search-results" style="margin-top:8px;max-height:240px;overflow-y:auto;"></div>',
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">',
      '<button type="button" class="pm-site-search-cancel" style="padding:7px 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:13px;cursor:pointer;">Cancel</button>',
      '</div></div>',
    ].join('');

    document.body.appendChild(dlg);

    const input = dlg.querySelector('.pm-site-search-input') as HTMLInputElement;
    const resultsContainer = dlg.querySelector('.pm-site-search-results') as HTMLDivElement;
    let debounceTimer: ReturnType<typeof setTimeout>;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim();
      if (!query) { resultsContainer.innerHTML = ''; return; }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/sites?filters[name][$containsi]=${encodeURIComponent(query)}&fields[0]=name&fields[1]=id&pagination[pageSize]=10`
          );
          const json = await res.json();
          const sites: { id: number; name: string }[] = (json.data ?? []).map(
            (item: any) => ({ id: Number(item.id), name: item.name ?? item.attributes?.name })
          );
          if (!sites.length) {
            resultsContainer.innerHTML = '<p style="font-size:13px;color:#64748b;margin:8px 0;">No sites found.</p>';
            return;
          }
          resultsContainer.innerHTML = sites
            .map((s) =>
              `<button type="button" class="pm-site-result" data-id="${s.id}" data-name="${escapeHtml(s.name)}" style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:13px;border-radius:4px;font-family:inherit;">${escapeHtml(s.name)} <span style="color:#94a3b8;">(#${s.id})</span></button>`
            ).join('');
        } catch {
          resultsContainer.innerHTML = '<p style="font-size:13px;color:#dc2626;margin:8px 0;">Search failed.</p>';
        }
      }, 300);
    });

    resultsContainer.addEventListener('click', (e: Event) => {
      const target = (e.target as HTMLElement).closest('.pm-site-result') as HTMLElement | null;
      if (!target) return;
      const id = target.dataset.id ?? '';
      const name = target.dataset.name ?? '';
      (dlg as HTMLDialogElement).close();
      dlg.remove();

      if (prefill?._modelEl) {
        editor.model.change((writer) => writer.setSelection(prefill._modelEl, 'on'));
      } else if (prefill && savedRange) {
        editor.model.change((writer) => writer.setSelection(savedRange));
      }
      const html = `<div data-component="site-card" data-site-id="${escapeHtml(id)}" class="pm-widget" contenteditable="false"><span class="pm-widget__label">Site Card: ${escapeHtml(name)}</span></div>`;
      const viewFragment = (editor.data.processor as any).toView(html);
      const modelFragment = editor.data.toModel(viewFragment);
      editor.model.insertContent(modelFragment);
      editor.editing.view.focus();
    });

    dlg.querySelector('.pm-site-search-cancel')?.addEventListener('click', () => {
      (dlg as HTMLDialogElement).close();
      dlg.remove();
    });

    (dlg as HTMLDialogElement).showModal();
    setTimeout(() => input.focus(), 50);
  }

  init() {
    const editor = this.editor;

    editor.ui.componentFactory.add('siteCard', (locale) => {
      const button = new ButtonView(locale);
      button.set({ label: 'Site Card', withText: true, tooltip: true });
      button.on('execute', () => this._openDialog(null));
      return button;
    });

    editor.on('ready', () => {
      const editableEl = editor.editing.view.getDomRoot();
      if (!editableEl) return;
      editableEl.addEventListener('dblclick', (e: MouseEvent) => {
        let el = e.target as HTMLElement | null;
        while (el && el.dataset?.component !== 'site-card') el = el.parentElement;
        if (!el) return;
        e.stopPropagation();
        const id = parseInt(el.dataset.siteId ?? '0', 10);
        const name = el.querySelector<HTMLElement>('.pm-widget__label')?.textContent?.replace(/^Site Card:\s*/, '') ?? '';
        const viewEl = editor.editing.view.domConverter.mapDomToView(el as Element);
        const _modelEl = viewEl ? editor.editing.mapper.toModelElement(viewEl as any) : null;
        this._openDialog({ id, name, _modelEl });
      });
    });
  }
}

// ─── SITE CARD LIST ───────────────────────────────────────────────────────────

class SiteCardListPlugin extends Plugin {
  static get pluginName() {
    return 'SiteCardListPlugin' as const;
  }

  _openDialog(
    prefill: { sites: { id: number; name: string }[]; show: number; _modelEl?: any } | null = null
  ) {
    const editor = this.editor;
    const savedRange = editor.model.document.selection.getFirstRange();

    const dlg = document.createElement('dialog');
    dlg.style.cssText =
      'padding:0;border:none;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.25);width:520px;max-height:90vh;overflow:hidden;z-index:99999;display:flex;flex-direction:column;';

    const showVal = prefill?.show ?? 5;
    dlg.innerHTML = [
      '<div style="padding:24px 24px 0;font-family:system-ui,sans-serif;">',
      `<h3 style="margin:0 0 16px;font-size:16px;font-weight:600;">${prefill ? 'Edit' : 'Insert'} Site Card List</h3>`,
      '<input type="text" class="pm-scl-search" placeholder="Search sites to add\u2026" style="display:block;width:100%;padding:8px 12px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;font-size:13px;font-family:inherit;" />',
      '<div class="pm-scl-search-results" style="margin-top:8px;max-height:160px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:4px;"></div>',
      '</div>',
      '<div style="padding:16px 24px;flex:1;overflow-y:auto;">',
      '<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Selected Sites</p>',
      '<ul class="pm-scl-selected" style="list-style:none;margin:0;padding:0;min-height:40px;"></ul>',
      '<p class="pm-scl-empty" style="font-size:13px;color:#94a3b8;margin:8px 0;">No sites added yet.</p>',
      '</div>',
      '<div style="padding:12px 24px 16px;border-top:1px solid #e2e8f0;">',
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">',
      '<label style="font-size:13px;font-weight:500;white-space:nowrap;">Show initially:</label>',
      `<input type="number" class="pm-scl-show-count" min="1" value="${showVal}" style="width:70px;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;font-family:inherit;" />`,
      '</div>',
      '<div style="display:flex;gap:8px;justify-content:flex-end;">',
      '<button type="button" class="pm-scl-cancel" style="padding:7px 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:13px;cursor:pointer;">Cancel</button>',
      `<button type="button" class="pm-scl-insert" style="padding:7px 16px;border:none;border-radius:4px;background:#4945ff;color:#fff;font-size:13px;cursor:pointer;font-weight:500;">${prefill ? 'Update' : 'Insert'}</button>`,
      '</div></div>',
    ].join('');

    document.body.appendChild(dlg);

    const searchInput = dlg.querySelector('.pm-scl-search') as HTMLInputElement;
    const searchResults = dlg.querySelector('.pm-scl-search-results') as HTMLDivElement;
    const selectedList = dlg.querySelector('.pm-scl-selected') as HTMLUListElement;
    const emptyMsg = dlg.querySelector('.pm-scl-empty') as HTMLParagraphElement;
    const showCountInput = dlg.querySelector('.pm-scl-show-count') as HTMLInputElement;

    const selected: { id: number; name: string }[] = prefill?.sites ? [...prefill.sites] : [];

    function moveItem(from: number, to: number) {
      if (to < 0 || to >= selected.length) return;
      const [item] = selected.splice(from, 1);
      selected.splice(to, 0, item);
      renderSelected();
    }

    function renderSelected() {
      emptyMsg.style.display = selected.length ? 'none' : 'block';
      selectedList.innerHTML = selected
        .map((s, i) => [
          `<li data-index="${i}" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;margin-bottom:6px;font-size:13px;font-family:system-ui,sans-serif;">`,
          `<span style="flex:1;">${escapeHtml(s.name)} <span style="color:#94a3b8;">(#${s.id})</span></span>`,
          `<button type="button" class="pm-scl-up" data-idx="${i}" title="Move up" style="border:1px solid #e2e8f0;background:#fff;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:12px;${i === 0 ? 'opacity:.3;' : ''}">&#9650;</button>`,
          `<button type="button" class="pm-scl-down" data-idx="${i}" title="Move down" style="border:1px solid #e2e8f0;background:#fff;border-radius:3px;padding:1px 7px;cursor:pointer;font-size:12px;${i === selected.length - 1 ? 'opacity:.3;' : ''}">&#9660;</button>`,
          `<button type="button" class="pm-scl-remove" data-idx="${i}" title="Remove" style="border:none;background:none;padding:1px 6px;cursor:pointer;color:#94a3b8;font-size:16px;line-height:1;">&times;</button>`,
          '</li>',
        ].join('')).join('');
    }

    selectedList.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null;
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (btn.classList.contains('pm-scl-up')) moveItem(idx, idx - 1);
      else if (btn.classList.contains('pm-scl-down')) moveItem(idx, idx + 1);
      else if (btn.classList.contains('pm-scl-remove')) { selected.splice(idx, 1); renderSelected(); }
    });

    let debounceTimer: ReturnType<typeof setTimeout>;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = searchInput.value.trim();
      if (!query) { searchResults.innerHTML = ''; return; }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/sites?filters[name][$containsi]=${encodeURIComponent(query)}&fields[0]=name&fields[1]=id&pagination[pageSize]=10`
          );
          const json = await res.json();
          const sites: { id: number; name: string }[] = (json.data ?? []).map(
            (item: any) => ({ id: Number(item.id), name: item.name ?? item.attributes?.name })
          );
          if (!sites.length) {
            searchResults.innerHTML = '<p style="font-size:13px;color:#64748b;padding:8px 12px;margin:0;">No sites found.</p>';
            return;
          }
          searchResults.innerHTML = sites
            .map((s) =>
              `<button type="button" class="pm-scl-result" data-id="${s.id}" data-name="${escapeHtml(s.name)}" style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:13px;border-radius:0;font-family:inherit;">${escapeHtml(s.name)} <span style="color:#94a3b8;">(#${s.id})</span></button>`
            ).join('');
        } catch {
          searchResults.innerHTML = '<p style="font-size:13px;color:#dc2626;padding:8px 12px;margin:0;">Search failed.</p>';
        }
      }, 300);
    });

    searchResults.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest('.pm-scl-result') as HTMLElement | null;
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const name = btn.dataset.name ?? '';
      if (selected.some((s) => s.id === id)) return;
      selected.push({ id, name });
      searchInput.value = '';
      searchResults.innerHTML = '';
      renderSelected();
    });

    dlg.querySelector('.pm-scl-cancel')?.addEventListener('click', () => {
      (dlg as HTMLDialogElement).close();
      dlg.remove();
    });

    dlg.querySelector('.pm-scl-insert')?.addEventListener('click', () => {
      if (!selected.length) return;
      const ids = selected.map((s) => s.id).join(',');
      const showCount = Math.max(1, parseInt(showCountInput.value, 10) || 5);
      const label = selected.map((s) => escapeHtml(s.name)).join(', ');
      (dlg as HTMLDialogElement).close();
      dlg.remove();

      if (prefill?._modelEl) {
        editor.model.change((writer) => writer.setSelection(prefill._modelEl, 'on'));
      } else if (prefill && savedRange) {
        editor.model.change((writer) => writer.setSelection(savedRange));
      }
      const html = `<div data-component="site-card-list" data-site-ids="${ids}" data-show="${showCount}" class="pm-widget" contenteditable="false"><span class="pm-widget__label">Site List (${showCount} shown): ${label}</span></div>`;
      const viewFragment = (editor.data.processor as any).toView(html);
      const modelFragment = editor.data.toModel(viewFragment);
      editor.model.insertContent(modelFragment);
      editor.editing.view.focus();
    });

    renderSelected();
    (dlg as HTMLDialogElement).showModal();
    setTimeout(() => searchInput.focus(), 50);
  }

  init() {
    const editor = this.editor;

    editor.ui.componentFactory.add('siteCardList', (locale) => {
      const button = new ButtonView(locale);
      button.set({ label: 'Site Card List', withText: true, tooltip: true });
      button.on('execute', () => this._openDialog(null));
      return button;
    });

    editor.on('ready', () => {
      const editableEl = editor.editing.view.getDomRoot();
      if (!editableEl) return;
      editableEl.addEventListener('dblclick', (e: MouseEvent) => {
        let el = e.target as HTMLElement | null;
        while (el && el.dataset?.component !== 'site-card-list') el = el.parentElement;
        if (!el) return;
        e.stopPropagation();
        const idsStr = el.dataset.siteIds ?? '';
        const show = parseInt(el.dataset.show ?? '5', 10);
        const ids = idsStr.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
        const viewEl = editor.editing.view.domConverter.mapDomToView(el as Element);
        const _modelEl = viewEl ? editor.editing.mapper.toModelElement(viewEl as any) : null;
        Promise.all(
          ids.map((id) =>
            fetch(`/api/sites?filters[id][$eq]=${id}&fields[0]=name&fields[1]=id&pagination[pageSize]=1`)
              .then((r) => r.json())
              .then((j) => {
                const item = j.data?.[0];
                return { id: Number(item?.id ?? id), name: item?.name ?? item?.attributes?.name ?? String(id) };
              })
              .catch(() => ({ id, name: String(id) }))
          )
        ).then((sites) => this._openDialog({ sites, show, _modelEl }));
      });
    });
  }
}

// ─── ARTICLE CARD ─────────────────────────────────────────────────────────────

class ArticleCardPlugin extends Plugin {
  static get pluginName() {
    return 'ArticleCardPlugin' as const;
  }

  _openDialog(prefill: { id: number; title: string; _modelEl?: any } | null = null) {
    const editor = this.editor;
    const savedRange = editor.model.document.selection.getFirstRange();

    const dlg = document.createElement('dialog');
    dlg.style.cssText =
      'padding:0;border:none;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.25);width:400px;z-index:99999;';

    const currentInfo = prefill
      ? `<p style="margin:0 0 12px;font-size:13px;color:#64748b;">Current: <strong>${escapeHtml(prefill.title)}</strong> \u2014 search below to replace</p>`
      : '';
    dlg.innerHTML = [
      '<div style="padding:24px;font-family:system-ui,sans-serif;">',
      `<h3 style="margin:0 0 16px;font-size:16px;font-weight:600;">${prefill ? 'Edit' : 'Insert'} Article Card</h3>`,
      currentInfo,
      '<input type="text" class="pm-article-search-input" placeholder="Search articles\u2026" style="display:block;width:100%;padding:8px 12px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;font-size:13px;font-family:inherit;" />',
      '<div class="pm-article-search-results" style="margin-top:8px;max-height:240px;overflow-y:auto;"></div>',
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">',
      '<button type="button" class="pm-article-search-cancel" style="padding:7px 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:13px;cursor:pointer;">Cancel</button>',
      '</div></div>',
    ].join('');

    document.body.appendChild(dlg);

    const input = dlg.querySelector('.pm-article-search-input') as HTMLInputElement;
    const resultsContainer = dlg.querySelector('.pm-article-search-results') as HTMLDivElement;
    let debounceTimer: ReturnType<typeof setTimeout>;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim();
      if (!query) { resultsContainer.innerHTML = ''; return; }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/articles?filters[title][$containsi]=${encodeURIComponent(query)}&fields[0]=title&fields[1]=slug&fields[2]=id&filters[publishedAt][$notNull]=true&pagination[pageSize]=10`
          );
          const json = await res.json();
          const articles: { id: number; title: string }[] = (json.data ?? []).map(
            (item: any) => ({
              id: item.id ?? item.attributes?.id,
              title: item.title ?? item.attributes?.title,
            })
          );
          if (!articles.length) {
            resultsContainer.innerHTML = '<p style="font-size:13px;color:#64748b;margin:8px 0;">No articles found.</p>';
            return;
          }
          resultsContainer.innerHTML = articles
            .map((a) =>
              `<button type="button" class="pm-article-result" data-id="${a.id}" data-title="${escapeHtml(a.title)}" style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:13px;border-radius:4px;font-family:inherit;">${escapeHtml(a.title)} <span style="color:#94a3b8;">(#${a.id})</span></button>`
            ).join('');
        } catch {
          resultsContainer.innerHTML = '<p style="font-size:13px;color:#dc2626;margin:8px 0;">Search failed.</p>';
        }
      }, 300);
    });

    resultsContainer.addEventListener('click', (e: Event) => {
      const target = (e.target as HTMLElement).closest('.pm-article-result') as HTMLElement | null;
      if (!target) return;
      const id = target.dataset.id ?? '';
      const title = target.dataset.title ?? '';
      (dlg as HTMLDialogElement).close();
      dlg.remove();

      if (prefill?._modelEl) {
        editor.model.change((writer) => writer.setSelection(prefill._modelEl, 'on'));
      } else if (prefill && savedRange) {
        editor.model.change((writer) => writer.setSelection(savedRange));
      }
      const html = `<div data-component="article-card" data-article-id="${escapeHtml(id)}" class="pm-widget" contenteditable="false"><span class="pm-widget__label">Article: ${escapeHtml(title)}</span></div>`;
      const viewFragment = (editor.data.processor as any).toView(html);
      const modelFragment = editor.data.toModel(viewFragment);
      editor.model.insertContent(modelFragment);
      editor.editing.view.focus();
    });

    dlg.querySelector('.pm-article-search-cancel')?.addEventListener('click', () => {
      (dlg as HTMLDialogElement).close();
      dlg.remove();
    });

    (dlg as HTMLDialogElement).showModal();
    setTimeout(() => input.focus(), 50);
  }

  init() {
    const editor = this.editor;

    editor.ui.componentFactory.add('articleCard', (locale) => {
      const button = new ButtonView(locale);
      button.set({ label: 'Article Card', withText: true, tooltip: true });
      button.on('execute', () => this._openDialog(null));
      return button;
    });

    editor.on('ready', () => {
      const editableEl = editor.editing.view.getDomRoot();
      if (!editableEl) return;
      editableEl.addEventListener('dblclick', (e: MouseEvent) => {
        let el = e.target as HTMLElement | null;
        while (el && el.dataset?.component !== 'article-card') el = el.parentElement;
        if (!el) return;
        e.stopPropagation();
        const id = parseInt(el.dataset.articleId ?? '0', 10);
        const title = el.querySelector<HTMLElement>('.pm-widget__label')?.textContent?.replace(/^Article:\s*/, '') ?? '';
        const viewEl = editor.editing.view.domConverter.mapDomToView(el as Element);
        const _modelEl = viewEl ? editor.editing.mapper.toModelElement(viewEl as any) : null;
        this._openDialog({ id, title, _modelEl });
      });
    });
  }
}

// Editor content styles for the pros/cons block inside CKEditor
const editorWidgetStyles = `
  .ck-content .pros-cons-block {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 16px 0;
  }
  .ck-content .pros-cons-block__pros {
    border: 1px solid #bbf7d0;
    background: #f0fdf4;
    border-radius: 8px;
    padding: 12px 16px;
  }
  .ck-content .pros-cons-block__cons {
    border: 1px solid #fecaca;
    background: #fef2f2;
    border-radius: 8px;
    padding: 12px 16px;
  }
  .ck-content .pros-cons-block ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ck-content .pros-cons-block li {
    position: relative;
    padding-left: 1.4em;
    margin: 4px 0;
    font-size: 0.9em;
  }
  .ck-content .pros-cons-block__pros li::before {
    content: '\\2713';
    position: absolute;
    left: 0;
    color: #16a34a;
    font-weight: 700;
  }
  .ck-content .pros-cons-block__cons li::before {
    content: '\\2717';
    position: absolute;
    left: 0;
    color: #dc2626;
    font-weight: 700;
  }
  .ck-content .pm-widget {
    display: block;
    border: 2px dashed #94a3b8;
    background: #f8fafc;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 16px 0;
    cursor: pointer;
  }
  .ck-content .pm-widget:hover {
    border-color: #4945ff;
    background: #f0f0ff;
  }
  .ck-content .pm-widget__label {
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
  }
  .ck-content .pm-widget__label::after {
    content: ' \u2014 double-click to edit';
    font-weight: 400;
    color: #94a3b8;
  }
  .ck-content a[class~="inline-flex"] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: #2563eb;
    padding-left: 1rem;
    padding-right: 1rem;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    text-decoration: none !important;
  }
  .ck-content a[class~="inline-flex"]:hover {
    background: #1d4ed8;
  }
`;

export default {
  register(app: any) {
    const { editorConfig } = defaultHtmlPreset;
    const existingToolbar = editorConfig.toolbar;
    const toolbarItems: string[] = Array.isArray(existingToolbar)
      ? (existingToolbar as string[])
      : ((existingToolbar as any)?.items ?? []) as string[];

    const newToolbar = Array.isArray(existingToolbar)
      ? [...toolbarItems, '|', 'prosCons', 'siteCard', 'siteCardList', 'articleCard']
      : { ...(existingToolbar as object), items: [...toolbarItems, '|', 'prosCons', 'siteCard', 'siteCardList', 'articleCard'] };

    const customHtmlPreset: Preset = {
      ...defaultHtmlPreset,
      name: 'defaultHtml',
      editorConfig: {
        ...editorConfig,
        link: {
          ...(editorConfig.link ?? {}),
          decorators: {
            ...(editorConfig.link?.decorators ?? {}),
            externalNofollow: {
              mode: 'manual',
              label: 'External (nofollow, blank)',
              attributes: {
                target: '_blank',
                rel: 'nofollow noopener noreferrer',
              },
            },
            buttonStyle: {
              mode: 'manual',
              label: 'Button Style',
              classes: ['inline-flex', 'items-center', 'justify-center', 'rounded-xl', 'bg-emerald-600', 'px-6', 'py-4', 'text-lg', 'font-bold', 'text-white', 'transition', 'hover:bg-emerald-700', 'active:scale-95', 'dark:bg-emerald-500', 'dark:hover:bg-emerald-600'],
            },
          },
        },
        extraPlugins: [
          ...(editorConfig.extraPlugins ?? []),
          ProsConsPlugin as any,
          SiteCardPlugin as any,
          SiteCardListPlugin as any,
          ArticleCardPlugin as any,
        ],
        toolbar: newToolbar,
      },
      styles: editorWidgetStyles,
    };

    setPluginConfig({ presets: [customHtmlPreset, defaultMarkdownPreset] });
  },
};
