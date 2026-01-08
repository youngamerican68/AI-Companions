import { Suspense } from 'react';
import { Filters } from '@/components/Filters';
import { Feed } from '@/components/Feed';

// Fetch platforms for filter dropdown
async function getPlatforms() {
  try {
    // Use absolute URL in production, relative in development
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/platforms`, {
      next: { revalidate: 60 }, // Revalidate every minute
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.platforms || [];
  } catch {
    // Return empty array on error (e.g., during build)
    return [];
  }
}

export default async function HomePage() {
  const platforms = await getPlatforms();

  return (
    <div>
      <Suspense
        fallback={<div className="tm-filters tm-loading" style={{ height: 32 }} />}
      >
        <Filters platforms={platforms} />
      </Suspense>

      <Suspense
        fallback={
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="tm-story">
                <div className="tm-loading" style={{ height: 12, width: 80, marginBottom: 4 }} />
                <div className="tm-loading" style={{ height: 18, width: '80%', marginBottom: 8 }} />
                <div className="tm-loading" style={{ height: 14, width: '100%', marginBottom: 4 }} />
                <div className="tm-loading" style={{ height: 14, width: '60%' }} />
              </div>
            ))}
          </div>
        }
      >
        <Feed />
      </Suspense>
    </div>
  );
}
