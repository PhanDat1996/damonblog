// lib/tool-og.tsx — 1200×630 social card for a tool page, same palette as the site OG image.

import { ImageResponse } from 'next/og';
import { getTool } from './tools';

export function renderToolOgImage(slug: string): ImageResponse {
  const tool = getTool(slug);

  return new ImageResponse(
    (
      <div
        style={{
          background: '#09090b',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 72px',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4ade80' }} />
          <span style={{ color: '#4ade80', fontSize: '20px' }}>damonsec.com/tools</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '150px',
              height: '150px',
              flexShrink: 0,
              borderRadius: '20px',
              border: '2px solid #27272a',
              background: '#18181b',
              color: '#4ade80',
              fontSize: tool.glyph.length > 2 ? '44px' : '56px',
              fontWeight: 'bold',
            }}
          >
            {tool.glyph}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ color: '#ffffff', fontSize: '58px', fontWeight: 'bold', lineHeight: 1.1, maxWidth: '860px' }}>
              {tool.title}
            </div>
            <div style={{ color: '#a1a1aa', fontSize: '26px', lineHeight: 1.4, maxWidth: '860px' }}>
              {tool.pitch}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '14px' }}>
          {['Free', 'Runs in your browser', 'Nothing is uploaded'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #27272a',
                color: '#d4d4d8',
                fontSize: '20px',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
