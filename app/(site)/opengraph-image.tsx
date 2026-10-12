import { ImageResponse } from 'next/og';

export const alt = 'SUN MEDIA — SMM, kontent va reklama agentligi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social preview: the black box with silver SUN, MEDIA and the lime bar, on ink. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: 'radial-gradient(70% 90% at 85% 15%, rgba(212,252,24,0.22), #050506 60%)',
          color: '#f4f4f5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              background: '#0b0b0c',
              border: '2px solid #3a3a3e',
              borderRadius: 10,
              padding: '18px 40px',
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: 18,
              color: '#e4e4e7',
            }}
          >
            SUN
          </div>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: 6 }}>
            MED<span style={{ color: '#d4fc18' }}>I</span>A
          </div>
        </div>
        <div style={{ marginTop: 48, fontSize: 40, color: '#a8a8ac', display: 'flex' }}>SMM · Kontent · Reklama</div>
        <div style={{ marginTop: 24, width: 140, height: 8, borderRadius: 8, background: '#d4fc18', display: 'flex' }} />
      </div>
    ),
    size,
  );
}
