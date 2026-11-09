import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import '@fontsource-variable/inter'
import './index.css'
import { initTheme } from '@/lib/theme'
import { AppLayout } from '@/layout/AppLayout'
import { OverviewPage } from '@/pages/OverviewPage'
import { PostsPage } from '@/pages/PostsPage'
import { BatchPage } from '@/pages/BatchPage'
import { DistributionPage } from './pages/DistributionPage'
import { ManualPlanPage } from '@/pages/ManualPlanPage'
import { AccountsPage } from '@/pages/AccountsPage'
import { ProxyPage } from '@/pages/ProxyPage'
import { ShopeePage } from '@/pages/ShopeePage'
import { RewritePage } from '@/pages/RewritePage'
import { AffiliatePage } from '@/pages/AffiliatePage'
import { InsightsPage } from './pages/InsightsPage'
import { PostLogPage } from '@/pages/PostLogPage'
import { TopicsPage } from '@/pages/TopicsPage'
import { SeedingPage } from '@/pages/SeedingPage'
import { GuidePage } from '@/pages/GuidePage'
import { ConfirmHost } from '@/components/ConfirmDialog'

initTheme()

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'posts', element: <PostsPage /> },
      { path: 'batch', element: <BatchPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'distribution', element: <DistributionPage /> },
      { path: 'distribution/plans/:id/edit', element: <ManualPlanPage /> },
      { path: 'proxy', element: <ProxyPage /> },
      { path: 'shopee', element: <ShopeePage /> },
      { path: 'rewrite', element: <RewritePage /> },
      { path: 'affiliate', element: <AffiliatePage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'post-log', element: <PostLogPage /> },
      { path: 'topics', element: <TopicsPage /> },
      { path: 'seeding', element: <SeedingPage /> },
      { path: 'guide', element: <GuidePage /> },
      { path: 'guide/:lessonId', element: <GuidePage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
      <ConfirmHost />
    </QueryClientProvider>
  </StrictMode>,
)

// PWA: service worker chi lo trang "chua ket noi duoc" khi server tat (xem public/sw.js).
// Chi dang ky trong secure context (localhost / https devtunnel) - trinh duyet bat buoc.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // khong dang ky duoc (trinh duyet chan, private mode...) -> app van chay binh thuong
    })
  })
}
