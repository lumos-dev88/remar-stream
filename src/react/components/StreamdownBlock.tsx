import React, { memo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import type { MarkdownCodeProps, MarkdownElementProps } from '../../core/types';

interface StreamdownBlockProps {
  children: string;
  components?: Record<string, React.ComponentType<MarkdownElementProps>>;
  remarkPlugins?: Pluggable[];
  animate?: boolean;
  blockType?: string;
  isTypePending?: boolean;
}

export const StreamdownBlock = memo<StreamdownBlockProps>(({
  children,
  components,
  remarkPlugins,
  animate,
  blockType,
  isTypePending,
}) => {
  // animate is only true on first mount for new blocks — capture it
  const shouldAnimate = useRef(animate);

  const componentsWithContext = React.useMemo(() => {
    if (!components) return undefined;
    return {
      ...components,
      code: (props: MarkdownCodeProps) => {
        const CodeComponent = components.code;
        if (!CodeComponent) return null;
        return (
          <CodeComponent
            {...props}
            data-block-type={blockType}
            data-type-pending={isTypePending}
          />
        );
      },
    };
  }, [components, blockType, isTypePending]);

  return (
    <div className={shouldAnimate.current ? 'remar-block remar-block--animate' : 'remar-block'}>
      <ReactMarkdown
        components={componentsWithContext as any}
        remarkPlugins={remarkPlugins}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

StreamdownBlock.displayName = 'StreamdownBlock';
