type TextNode = {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};

type LinkNode = {
  type: 'link';
  url: string;
  children: InlineNode[];
};

type InlineNode = TextNode | LinkNode;

type ParagraphBlock = {
  type: 'paragraph';
  children: InlineNode[];
};

type HeadingBlock = {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
};

type ListItemBlock = {
  type: 'list-item';
  children: InlineNode[];
};

type ListBlock = {
  type: 'list';
  format: 'ordered' | 'unordered';
  children: ListItemBlock[];
};

type QuoteBlock = {
  type: 'quote';
  children: InlineNode[];
};

type CodeBlock = {
  type: 'code';
  children: InlineNode[];
};

type Block = ParagraphBlock | HeadingBlock | ListBlock | QuoteBlock | CodeBlock;

function renderInline(node: InlineNode, key: number): React.ReactNode {
  if (node.type === 'link') {
    return (
      <a key={key} href={node.url} className="text-emerald-600 hover:underline dark:text-emerald-400" rel="noopener noreferrer">
        {node.children.map((c, i) => renderInline(c, i))}
      </a>
    );
  }

  let content: React.ReactNode = node.text;
  if (node.bold) content = <strong key={`b${key}`}>{content}</strong>;
  if (node.italic) content = <em key={`i${key}`}>{content}</em>;
  if (node.underline) content = <u key={`u${key}`}>{content}</u>;
  if (node.strikethrough) content = <s key={`s${key}`}>{content}</s>;
  if (node.code) content = <code key={`c${key}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-sm dark:bg-slate-800">{content}</code>;

  return <span key={key}>{content}</span>;
}

const HEADING_CLASSES: Record<number, string> = {
  1: 'text-2xl font-bold text-slate-900 dark:text-white mt-6 mb-3',
  2: 'text-xl font-bold text-slate-900 dark:text-white mt-5 mb-2',
  3: 'text-lg font-semibold text-slate-900 dark:text-white mt-4 mb-2',
  4: 'text-base font-semibold text-slate-900 dark:text-white mt-3 mb-1',
  5: 'text-sm font-semibold text-slate-900 dark:text-white mt-3 mb-1',
  6: 'text-sm font-medium text-slate-900 dark:text-white mt-2 mb-1',
};

function renderBlock(block: Block, index: number): React.ReactNode {
  switch (block.type) {
    case 'paragraph': {
      const children = block.children.map((c, i) => renderInline(c, i));
      return (
        <p key={index} className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
          {children}
        </p>
      );
    }
    case 'heading': {
      const Tag = `h${block.level}` as keyof React.JSX.IntrinsicElements;
      return (
        <Tag key={index} className={HEADING_CLASSES[block.level]}>
          {block.children.map((c, i) => renderInline(c, i))}
        </Tag>
      );
    }
    case 'list': {
      const Tag = block.format === 'ordered' ? 'ol' : 'ul';
      const listClass = block.format === 'ordered'
        ? 'list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300'
        : 'list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300';
      return (
        <Tag key={index} className={listClass}>
          {block.children.map((item, i) => (
            <li key={i}>{item.children.map((c, j) => renderInline(c, j))}</li>
          ))}
        </Tag>
      );
    }
    case 'quote': {
      return (
        <blockquote key={index} className="border-l-4 border-emerald-400 pl-4 italic text-slate-600 dark:border-emerald-600 dark:text-slate-400">
          {block.children.map((c, i) => renderInline(c, i))}
        </blockquote>
      );
    }
    case 'code': {
      return (
        <pre key={index} className="overflow-x-auto rounded-lg bg-slate-100 p-4 font-mono text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          {block.children.map((c, i) => renderInline(c, i))}
        </pre>
      );
    }
    default:
      return null;
  }
}

interface RichTextProps {
  content: unknown;
  className?: string;
}

export default function RichText({ content, className = '' }: RichTextProps) {
  if (!content) return null;

  // CKEditor HTML string
  if (typeof content === 'string') {
    if (!content.trim()) return null;
    return (
      <div
        className={`prose prose-slate dark:prose-invert max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // Legacy blocks format (array)
  if (!Array.isArray(content) || content.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {(content as Block[]).map((block, i) => renderBlock(block, i))}
    </div>
  );
}
