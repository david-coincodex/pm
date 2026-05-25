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

class ProsConsPlugin extends Plugin {
  static get pluginName() {
    return 'ProsConsPlugin' as const;
  }

  init() {
    const editor = this.editor;

    editor.ui.componentFactory.add('prosCons', (locale) => {
      const button = new ButtonView(locale);

      button.set({
        label: 'Pros & Cons',
        withText: true,
        tooltip: true,
      });

      button.on('execute', () => {
        const dlg = document.createElement('dialog');
        dlg.style.cssText =
          'padding:0;border:none;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.25);width:460px;z-index:99999;';

        dlg.innerHTML = `
          <form method="dialog" style="padding:24px;font-family:system-ui,sans-serif;">
            <h3 style="margin:0 0 20px;font-size:16px;font-weight:600;">Insert Pros &amp; Cons</h3>
            <div style="margin-bottom:16px;">
              <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#16a34a;">
                ✓ Pros – one item per line
              </label>
              <textarea name="pros" rows="5"
                style="display:block;width:100%;padding:8px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;font-size:13px;resize:vertical;font-family:inherit;"
                placeholder="Fast performance&#10;Easy setup&#10;Great support"></textarea>
            </div>
            <div style="margin-bottom:24px;">
              <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#dc2626;">
                ✗ Cons – one item per line
              </label>
              <textarea name="cons" rows="5"
                style="display:block;width:100%;padding:8px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;font-size:13px;resize:vertical;font-family:inherit;"
                placeholder="Expensive pricing&#10;Limited free tier"></textarea>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button type="button" class="ck-pros-cons-cancel"
                style="padding:7px 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:13px;cursor:pointer;">
                Cancel
              </button>
              <button type="submit"
                style="padding:7px 16px;border:none;border-radius:4px;background:#4945ff;color:#fff;font-size:13px;cursor:pointer;font-weight:500;">
                Insert
              </button>
            </div>
          </form>`;

        document.body.appendChild(dlg);

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

          const html =
            `<div class="pros-cons-block">` +
            `<div class="pros-cons-block__pros"><ul>${prosHtml}</ul></div>` +
            `<div class="pros-cons-block__cons"><ul>${consHtml}</ul></div>` +
            `</div>`;

          const viewFragment = (editor.data.processor as any).toView(html);
          const modelFragment = editor.data.toModel(viewFragment);
          editor.model.insertContent(modelFragment);
          editor.editing.view.focus();
        });

        (dlg as HTMLDialogElement).showModal();
        setTimeout(() => {
          (dlg.querySelector('textarea[name="pros"]') as HTMLElement | null)?.focus();
        }, 50);
      });

      return button;
    });
  }
}

// Editor content styles for the pros/cons block inside CKEditor
const prosConsEditorStyles = `
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
`;

export default {
  register() {
    const { editorConfig } = defaultHtmlPreset;
    const existingToolbar = editorConfig.toolbar;
    const toolbarItems: unknown[] = Array.isArray(existingToolbar)
      ? existingToolbar
      : (existingToolbar as any)?.items ?? [];

    const newToolbar = Array.isArray(existingToolbar)
      ? [...toolbarItems, '|', 'prosCons']
      : { ...(existingToolbar as object), items: [...toolbarItems, '|', 'prosCons'] };

    const customHtmlPreset: Preset = {
      ...defaultHtmlPreset,
      name: 'defaultHtml',
      editorConfig: {
        ...editorConfig,
        extraPlugins: [
          ...(editorConfig.extraPlugins ?? []),
          ProsConsPlugin as any,
        ],
        toolbar: newToolbar,
      },
      styles: prosConsEditorStyles,
    };

    setPluginConfig({ presets: [customHtmlPreset, defaultMarkdownPreset] });
  },
};
