'use client';

// Renders ```mermaid fences inside .prose as SVG diagrams. The mermaid library
// is only downloaded when the page actually has a diagram; until it renders
// (or if it fails) the reader sees the diagram source as a plain code block.

import { useEffect } from 'react';

export default function Mermaid() {
  useEffect(() => {
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>('.prose pre > code.language-mermaid'),
    );
    if (blocks.length === 0) return;

    let cancelled = false;
    (async () => {
      const { default: mermaid } = await import('mermaid');
      // Mermaid sizes boxes by measuring text, so it needs the real font name
      // (not a CSS variable) and the web font loaded before it measures.
      await document.fonts.ready;
      const fontFamily = getComputedStyle(blocks[0].closest('.prose') ?? document.body).fontFamily;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        fontFamily,
        themeVariables: {
          darkMode: true,
          background: '#18181b',
          primaryColor: '#27272a',
          primaryBorderColor: '#52525b',
          primaryTextColor: '#e4e4e7',
          secondaryColor: '#14532d',
          tertiaryColor: '#18181b',
          lineColor: '#a1a1aa',
          textColor: '#e4e4e7',
          clusterBkg: '#18181b',
          clusterBorder: '#3f3f46',
          noteBkgColor: '#27272a',
          noteTextColor: '#d4d4d8',
          noteBorderColor: '#52525b',
          actorBkg: '#27272a',
          actorBorder: '#52525b',
          actorTextColor: '#e4e4e7',
          signalColor: '#d4d4d8',
          signalTextColor: '#e4e4e7',
          activationBkgColor: '#3f3f46',
          fontSize: '14px',
        },
      });

      for (const [i, code] of blocks.entries()) {
        if (cancelled) return;
        const pre = code.parentElement;
        if (!pre) continue;
        try {
          const { svg } = await mermaid.render(`mermaid-${i}`, code.textContent ?? '');
          if (cancelled) return;
          const figure = document.createElement('figure');
          figure.className = 'mermaid-diagram';
          figure.innerHTML = svg;
          pre.parentElement?.classList.contains('code-block')
            ? pre.parentElement.replaceWith(figure)
            : pre.replaceWith(figure);
        } catch (err) {
          // Leave the source visible; a broken diagram shouldn't break the post.
          console.error('mermaid render failed', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
