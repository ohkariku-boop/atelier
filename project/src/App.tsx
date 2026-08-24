import { ThemeProvider } from '@/context/ThemeContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { GalleryFloor } from '@/pages/GalleryFloor';
import { AuctionDetail } from '@/pages/AuctionDetail';
import { ArtistProfile } from '@/pages/ArtistProfile';
import { StudioDesk } from '@/pages/StudioDesk';
import { OrderTracking } from '@/pages/OrderTracking';
import { TrustSafety } from '@/pages/TrustSafety';
import { AuthPage } from '@/pages/AuthPage';
import { AdminReview } from '@/pages/AdminReview';
import { MessagesPage } from '@/pages/MessagesPage';
import { CollectionPage } from '@/pages/CollectionPage';
import { VerifyPage } from '@/pages/VerifyPage';
import { CollectorVault } from '@/pages/CollectorVault';
import { HouseFloor } from '@/pages/HouseFloor';
import { KycPage } from '@/pages/KycPage';
import { HowToBuy } from '@/pages/HowToBuy';
import { SellPage } from '@/pages/SellPage';
import { JournalPage } from '@/pages/JournalPage';
import { SalesCalendar } from '@/pages/SalesCalendar';
import { SaleDetailPage } from '@/pages/SaleDetailPage';
import { MyBidsPage } from '@/pages/MyBidsPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { EntryFoyer, shouldShowFoyer, markFoyerSeen, requestFoyerReplay } from '@/components/EntryFoyer';

function AppContent() {
  const { route, navigate } = useRouter();
  const { session, loading } = useAuth();
  const [showFoyer, setShowFoyer] = useState(() => shouldShowFoyer());

  const openFoyer = () => {
    requestFoyerReplay();
    setShowFoyer(true);
    if (route.name !== 'gallery') {
      navigate('gallery');
    }
  };


  // Deep links skip foyer (auction/artist/admin etc.)
  useEffect(() => {
    if (route.name !== 'gallery') setShowFoyer(false);
  }, [route.name]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
      </div>
    );
  }

  if (showFoyer && route.name === 'gallery') {
    return (
      <EntryFoyer
        onComplete={() => {
          markFoyerSeen();
          setShowFoyer(false);
        }}
      />
    );
  }

  const isProtectedRoute = route.name === 'studio' || route.name === 'orders' || route.name === 'admin' || route.name === 'messages';
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
          <GalleryFloor navigate={navigate} onOpenFoyer={openFoyer} />
        ) : route.name === 'auction' ? (
          <AuctionDetail auctionId={route.auctionId} navigate={navigate} />
        ) : route.name === 'artist' ? (
          <ArtistProfile artistId={route.artistId} navigate={navigate} />
        ) : route.name === 'studio' ? (
          <StudioDesk navigate={navigate} />
        ) : route.name === 'orders' ? (
          <OrderTracking navigate={navigate} />
        ) : route.name === 'trust' ? (
          <TrustSafety navigate={navigate} section={route.section} />
        ) : route.name === 'admin' ? (
          <AdminReview navigate={navigate} />
        ) : route.name === 'messages' ? (
          <MessagesPage navigate={navigate} conversationId={route.conversationId} />
        ) : route.name === 'collection' ? (
          <CollectionPage slug={route.slug} navigate={navigate} />
        ) : route.name === 'verify' ? (
          <VerifyPage slug={route.slug} navigate={navigate} />
        ) : route.name === 'vault' ? (
          <CollectorVault navigate={navigate} />
        ) : route.name === 'house' ? (
          <HouseFloor slug={route.slug} navigate={navigate} />
        ) : route.name === 'kyc' ? (
          <KycPage navigate={navigate} />
        ) : route.name === 'how-to-buy' ? (
          <HowToBuy navigate={navigate} />
        ) : route.name === 'sell' ? (
          <SellPage navigate={navigate} />
        ) : route.name === 'journal' ? (
          <JournalPage navigate={navigate} slug={route.slug} />
        ) : route.name === 'sales' ? (
          <SalesCalendar navigate={navigate} />
        ) : route.name === 'sale' ? (
          <SaleDetailPage slug={route.slug} navigate={navigate} />
        ) : route.name === 'my-bids' ? (
          <MyBidsPage navigate={navigate} />
        ) : route.name === 'results' ? (
          <ResultsPage navigate={navigate} />
        ) : null}
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </CurrencyProvider>
    </ThemeProvider>
  );
}

export default App;
