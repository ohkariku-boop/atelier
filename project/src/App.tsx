import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { GalleryFloor } from '@/pages/GalleryFloor';
import { AuctionDetail } from '@/pages/AuctionDetail';
import { StudioDesk } from '@/pages/StudioDesk';
import { OrderTracking } from '@/pages/OrderTracking';
import { AuthPage } from '@/pages/AuthPage';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { route, navigate } = useRouter();
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
      </div>
    );
  }

  const isProtectedRoute = route.name === 'studio' || route.name === 'orders';
  const needsAuth = isProtectedRoute && !session;

  return (
    <div className="min-h-screen flex flex-col">
      <Header route={route} navigate={navigate} />
      <main className="flex-1">
        {needsAuth ? (
          <AuthPage navigate={navigate} />
        ) : route.name === 'auth' ? (
          <AuthPage navigate={navigate} />
        ) : route.name === 'gallery' ? (
          <GalleryFloor navigate={navigate} />
        ) : route.name === 'auction' ? (
          <AuctionDetail auctionId={route.auctionId} navigate={navigate} />
        ) : route.name === 'studio' ? (
          <StudioDesk navigate={navigate} />
        ) : route.name === 'orders' ? (
          <OrderTracking navigate={navigate} />
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
