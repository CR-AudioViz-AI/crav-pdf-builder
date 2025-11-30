import './globals.css'
import Script from 'next/script';
import { Inter } from 'next/font/google'
import ErrorBoundary from '@/components/ErrorBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'PDF Builder Pro | CR AudioViz AI',
  description: 'Create professional PDFs with AI-powered content generation. Build business proposals, technical reports, resumes, and more with our intuitive editor.',
  keywords: 'PDF builder, document creator, AI content generation, professional documents, business proposals',
  authors: [{ name: 'CR AudioViz AI' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#2563eb',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#2563eb" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={inter.className}>
        {/* Skip to main content link for screen readers */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg"
        >
          Skip to main content
        </a>
        
        {/* Error Boundary wraps entire app */}
        <ErrorBoundary>
          <main id="main-content" role="main">
            {children}
          </main>
        </ErrorBoundary>

        {/* Live region for announcements (accessibility) */}
        <div
          id="live-region"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />
              {/* Javari AI Assistant */}
        <Script src="https://javariai.com/embed.js" strategy="lazyOnload" />
      </body>
    </html>
  )
}
