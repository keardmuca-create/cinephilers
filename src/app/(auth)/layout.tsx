import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <svg width="280" viewBox="0 0 520 110" aria-label="Cinephilers">
            <text x="260" y="95" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700">
              <tspan fill="hsl(348,83%,47%)" fontSize="130">C</tspan>
              <tspan fill="hsl(0,0%,8%)" fontSize="68" dy="-18" stroke="hsl(0,0%,8%)" strokeWidth="2" paintOrder="stroke">inephilers</tspan>
            </text>
          </svg>
          <p className="text-muted-foreground text-sm -mt-1">Track. Rate. Discover.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
