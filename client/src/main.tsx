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
import { AccountsPage } from '@/pages/AccountsPage'
import { ProxyPage } from '@/pages/ProxyPage'
import { ShopeePage } from '@/pages/ShopeePage'

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
      { path: 'proxy', element: <ProxyPage /> },
      { path: 'shopee', element: <ShopeePage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
)
