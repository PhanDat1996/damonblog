import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Damon — DevOps, NGINX & Linux Troubleshooting';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
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
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: '#4ade80',
          }} />
          <span style={{ color: '#4ade80', fontSize: '18px' }}>damonsec.com</span>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            color: '#4ade80',
            fontSize: '16px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>
            Senior DevOps & Infrastructure Engineer
          </div>
          <div style={{
            color: '#ffffff',
            fontSize: '56px',
            fontWeight: 'bold',
            lineHeight: 1.15,
            maxWidth: '900px',
          }}>
            DevOps, NGINX & Linux Troubleshooting
          </div>
          <div style={{ color: '#71717a', fontSize: '22px', maxWidth: '800px', lineHeight: 1.5 }}>
            Real-world guides on 502 errors, TIME_WAIT exhaustion, Docker infrastructure, and production debugging.
          </div>
        </div>

        {/* Bottom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: '#4ade80',
            color: '#09090b',
            padding: '10px 24px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
          }}>
            damonsec.com/blog
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}