# CKEditor Link Decorators Configuration Guide

## Overview
The `@_sh/strapi-plugin-ckeditor` package (v7.1.1) provides support for CKEditor 5 link decorators within the Strapi plugin. Link decorators allow you to add custom attributes and styling options to links.

## Default Configuration Pattern

From the default HTML preset in the plugin, here's the established link decorators configuration:

```javascript
link: {
  decorators: {
    toggleDownloadable: {
      mode: "manual",
      label: "Downloadable",
      attributes: {
        download: "file"
      }
    }
  },
  addTargetToExternalLinks: true,
  defaultProtocol: "https://"
}
```

## Link Decorator Structure

Each decorator follows this pattern:

```typescript
{
  [decoratorId]: {
    mode: "manual" | "automatic",
    label: string,
    attributes?: Record<string, string>,
    classes?: string | string[],
    styles?: Record<string, string>,
    callback?: (url: string) => boolean  // For automatic mode
  }
}
```

### Configuration Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `mode` | `"manual" \| "automatic"` | **manual**: User toggles via UI; **automatic**: Applied based on callback | `"manual"` |
| `label` | `string` | Button label in the link UI | `"Downloadable"` |
| `attributes` | `Record<string, string>` | HTML attributes to add to links | `{ download: "file" }` |
| `classes` | `string \| string[]` | CSS classes to apply | `"external-link"` or `["external", "link"]` |
| `styles` | `Record<string, string>` | Inline styles to apply | `{ color: "blue" }` |
| `callback` | `(url: string) => boolean` | For automatic mode: determines if decorator should apply | Detect external URLs |

## Common Use Cases

### 1. Downloadable Links
```javascript
toggleDownloadable: {
  mode: "manual",
  label: "Downloadable",
  attributes: {
    download: "file"
  }
}
```

### 2. External Links (Automatic)
```javascript
toggleExternalLink: {
  mode: "automatic",
  label: "External Link",
  attributes: {
    target: "_blank",
    rel: "noopener noreferrer"
  },
  callback: (url) => {
    try {
      const currentHost = new URL(window.location.href).hostname;
      const linkHost = new URL(url).hostname;
      return currentHost !== linkHost;
    } catch {
      return false;
    }
  }
}
```

### 3. No-Follow Links
```javascript
toggleNofollow: {
  mode: "manual",
  label: "No Follow",
  attributes: {
    rel: "nofollow"
  }
}
```

### 4. Button-Style Links with Classes
```javascript
buttonStyle: {
  mode: "manual",
  label: "Button",
  classes: "btn btn-primary"
}
```

## How to Configure in Strapi Admin

Update your `src/admin/app.tsx` file to add link decorators to the editor configuration:

```typescript
import {
  setPluginConfig,
  defaultHtmlPreset,
  type Preset,
} from '@_sh/strapi-plugin-ckeditor';

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
              classes: ['inline-flex', 'items-center', 'justify-center', 'rounded-lg', 'bg-blue-600', 'px-4', 'py-2', 'text-sm', 'font-semibold', 'text-white', 'transition', 'hover:bg-blue-700'],
            },
          },
        },
        extraPlugins: [
          ...(editorConfig.extraPlugins ?? []),
          // ... other plugins
        ],
        toolbar: newToolbar,
      },
      styles: editorWidgetStyles,
    };

    setPluginConfig({ presets: [customHtmlPreset, defaultMarkdownPreset] });
  },
};
```

### Verified Working Example

The above configuration has been successfully implemented in `/backend/src/admin/app.tsx` and provides two link decorators:

1. **External (nofollow, blank)** - Adds `target="_blank"` and `rel="nofollow noopener noreferrer"` attributes
2. **Button Style** - Applies Tailwind CSS button styling classes

These appear as toggleable options in the "Link properties" panel when editing a link in the CKEditor.
  }
};

export default {
  register() {
    setPluginConfig({
      presets: [customHtmlPreset],
    });
  },
};
```

## Additional Link Configuration Options

The link configuration also supports:

- **`addTargetToExternalLinks: boolean`** - Automatically adds `target="_blank"` to external links
- **`defaultProtocol: string`** - Protocol to use when no protocol is specified (e.g., `"https://"`)

## CKEditor 5 Documentation Reference

Link decorators are part of CKEditor 5's Link feature configuration. For more details:
- Main reference: https://ckeditor.com/docs/ckeditor5/latest/getting-started/setup/configuration.html
- Plugin info: [https://ckeditor.com/docs/ckeditor5/latest/features/link.html](https://ckeditor.com/docs/ckeditor5/latest/features/link.html)

## Notes

1. **Preset Inheritance**: You can extend the default preset and customize the link decorators without recreating the entire configuration
2. **EditorConfig Type**: The `editorConfig` property accepts the full CKEditor 5 `EditorConfig` type
3. **Configuration Immutability**: After calling `setPluginConfig()`, the configuration becomes immutable
4. **Multiple Decorators**: You can define multiple decorators - each will appear as a separate button/option in the link UI
5. **Mode Types**:
   - `"manual"`: User explicitly toggles the decorator via UI checkbox/button
   - `"automatic"`: Applied automatically based on a callback function that determines applicability
