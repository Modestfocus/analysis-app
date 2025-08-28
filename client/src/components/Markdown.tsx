// client/src/components/Markdown.tsx
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  children: string;
  className?: string;
};

export default function Markdown({ children, className = "" }: Props) {
  // Defensive: ensure a string is passed
  const text = typeof children === "string" ? children : String(children ?? "");

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Security: only render links with target=_blank + rel
        components={{
          a: ({node, ...props}) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
          // Keep code blocks readable
          code: ({inline, className, children, ...props}) => {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
