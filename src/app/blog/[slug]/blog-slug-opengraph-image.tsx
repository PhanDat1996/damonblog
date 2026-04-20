import { ImageResponse } from 'next/og';
import { getPostBySlug } from '@/lib/posts';

export const runtime = 'edge';
export const alt = 'Blog post';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);

  const title = post?.title ?? 'damonsec.com';
  const tags = post?.tags?.slice(0, 3) ?? [];
  const readingTime = post?.readingTime ?? '';

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
        {/* Top */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4ade80' }} />
          <span style={{ color: '#4ade80', fontSize: '18px' }}>damonsec.com/blog</span>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: '10px' }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: '#052e16',
                    color: '#4ade80',
                    border: '1px solid #166534',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div style={{
            color: '#ffffff',
            fontSize: title.length > 60 ? '42px' : '52px',
            fontWeight: 'bold',
            lineHeight: 1.2,
            maxWidth: '980px',
          }}>
            {title}
          </div>
        </div>

        {/* Bottom */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#52525b', fontSize: '16px' }}>Damon · damonsec.com</span>
          {readingTime && (
            <span style={{ color: '#52525b', fontSize: '16px' }}>{readingTime}</span>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}