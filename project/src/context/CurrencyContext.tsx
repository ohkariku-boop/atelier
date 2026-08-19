import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import {
  setDisplayCurrency,
  getDisplayCurrency,
  type DisplayCurrency,
} from '@/lib/theme';

interface CurrencyContextValue {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const OPTIONS: DisplayCurrency[] = ['USD', 'EUR', 'GBP', 'SGD', 'JPY'];

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(() => getDisplayCurrency());

  useEffect(() => {
    setDisplayCurrency(currency);
  }, [currency]);

  const value = useMemo(
    () => ({
      currency,
      setCurrency: (c: DisplayCurrency) => setCurrencyState(c),
    }),
    [currency]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}

export const CURRENCY_OPTIONS = OPTIONS;
