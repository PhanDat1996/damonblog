'use client';

// Adds a Copy button to every code block inside .prose. Runs after hydration
// so the server-rendered HTML stays plain and nothing shifts while it loads.

import { useEffect } from 'react';

export default function CodeCopy() {
  useEffect(() => {
    const blocks = Array.from(document.querySelectorAll<HTMLPreElement>('.prose pre'));
    const cleanups: Array<() => void> = [];
    const copyKey = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘C' : 'Ctrl+C';

    for (const pre of blocks) {
      if (pre.parentElement?.classList.contains('code-block')) continue;

      // Wrap the pre so the button stays put while the code scrolls sideways.
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      pre.replaceWith(wrapper);
      wrapper.appendChild(pre);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code to clipboard');

      let timer: ReturnType<typeof setTimeout> | undefined;
      const onClick = async () => {
        const code = pre.querySelector('code') ?? pre;
        const text = (code.textContent ?? '').replace(/\n$/, '');
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied';
        } catch {
          // Clipboard API blocked (permissions, embedded browsers): select the
          // code and try the legacy copy command, so Ctrl+C works either way.
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          button.textContent = document.execCommand('copy') ? 'Copied' : `Press ${copyKey}`;
        }
        clearTimeout(timer);
        timer = setTimeout(() => { button.textContent = 'Copy'; }, button.textContent === 'Copied' ? 1500 : 3000);
      };

      button.addEventListener('click', onClick);
      wrapper.appendChild(button);
      cleanups.push(() => {
        clearTimeout(timer);
        button.removeEventListener('click', onClick);
      });
    }

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
