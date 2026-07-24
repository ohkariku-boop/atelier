import { Moon, Sun, Palette, LayoutGrid, Package, BarChart3, LogOut, User as UserIcon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

interface HeaderProps {
  route: { name: string };
  navigate: (path: string) => void;
}

export function Header({ route, navigate }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { session, profile, signOut } = useAuth();

  const navItems = [
    { name: 'gallery', label: 'Gallery Floor', icon: LayoutGrid, path: '' },
    ...(profile?.role === 'artist'
      ? [{ name: 'studio', label: 'Studio Desk', icon: BarChart3, path: 'studio' }]
      : []),
    { name: 'orders', label: 'Orders', icon: Package, path: 'orders' },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('');
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-ink-50/80 dark:bg-ink-950/80 border-b border-ink-200 dark:border-ink-800 transition-colors duration-300">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-16">
          <button
            onClick={() => navigate('')}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-9 h-9 bg-ink-900 dark:bg-ink-50 flex items-center justify-center transition-transform group-hover:scale-105">
              <Palette className="w-5 h-5 text-ink-50 dark:text-ink-900" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-serif text-lg font-semibold tracking-tight">Atelier</span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-ink-500 mt-0.5">Human Art Only</span>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = route.name === item.name || (item.name === 'gallery' && route.name === 'auction');
              return (
                <button
                  key={item.name}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'text-ink-900 dark:text-ink-50'
                      : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {session ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-ink-100 dark:bg-ink-800">
                  <div className="w-6 h-6 bg-ink-900 dark:bg-ink-50 rounded-full flex items-center justify-center text-xs font-bold text-ink-50 dark:text-ink-900">
                    {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-xs font-medium">{profile?.display_name || 'User'}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-50 transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('auth')}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider btn-primary"
              >
                <UserIcon className="w-3.5 h-3.5" />
                Sign In
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-50 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex md:hidden items-center gap-1 pb-3 -mt-1">
          {navItems.map((item) => {
            const isActive = route.name === item.name || (item.name === 'gallery' && route.name === 'auction');
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-ink-900 dark:text-ink-50' : 'text-ink-500'
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
